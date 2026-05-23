// HTTP-обёртка над CLI-бинарём glb_unwrapper.
//
// Сервис не несёт логики развёртки — за неё отвечает C++ бинарь. Здесь
// только адаптер: принять GLB (по имени модели или загруженный файл),
// дернуть CLI, отдать результат. Это даёт нам устойчивый HTTP-API без
// необходимости править C++ слой и при этом сохраняет zero-deps сборку
// (стандартная библиотека Go).
//
// Эндпоинты:
//   GET  /healthz                                — пингуем CLI с --help.
//   POST /inspect                                — body = GLB, text/plain.
//   POST /export-uv-svg                          — body = GLB, query: mesh,primitive,flipV,stroke,fill,width,height,margin
//                                                   → image/svg+xml.
//   POST /export-print-kit                       — body = GLB + JSON-параметры
//                                                   через multipart/form-data
//                                                   → application/zip.
//   POST /by-model/{name}/export-print-kit       — модель берётся из /models/
//                                                   внутри контейнера, кладём
//                                                   туда GLB на сборке.
//
// Бинарь glb_unwrapper ожидается в $GLB_UNWRAPPER_BIN либо в PATH.
package main

import (
	"archive/zip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const (
	defaultBinPath    = "glb_unwrapper"
	defaultModelsDir  = "/models"
	defaultListenAddr = ":8000"
	defaultExecTO     = 60 * time.Second
	maxBodyBytes      = 64 * 1024 * 1024 // 64 МБ хватит на любую сцену из проекта
)

type config struct {
	binPath    string
	modelsDir  string
	listenAddr string
	execTO     time.Duration
}

func loadConfig() config {
	c := config{
		binPath:    envOr("GLB_UNWRAPPER_BIN", defaultBinPath),
		modelsDir:  envOr("GLB_UNWRAPPER_MODELS_DIR", defaultModelsDir),
		listenAddr: envOr("GLB_UNWRAPPER_LISTEN_ADDR", defaultListenAddr),
		execTO:     defaultExecTO,
	}
	return c
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	cfg := loadConfig()
	if _, err := exec.LookPath(cfg.binPath); err != nil {
		log.Fatalf("glb_unwrapper binary not found at %q: %v", cfg.binPath, err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", healthzHandler(cfg))
	mux.HandleFunc("/inspect", inspectHandler(cfg))
	mux.HandleFunc("/export-uv-svg", exportUVSVGHandler(cfg))
	mux.HandleFunc("/export-print-kit", exportPrintKitHandler(cfg))
	mux.HandleFunc("/by-model/", byModelHandler(cfg))

	srv := &http.Server{
		Addr:              cfg.listenAddr,
		Handler:           withLogging(mux),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       60 * time.Second,
		WriteTimeout:      120 * time.Second,
		IdleTimeout:       90 * time.Second,
	}

	log.Printf("glb-unwrapper-server listening on %s (bin=%s, models=%s)",
		cfg.listenAddr, cfg.binPath, cfg.modelsDir)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("server error: %v", err)
	}
}

// ───────────────────────────── handlers ────────────────────────────────

func healthzHandler(cfg config) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		// Самая быстрая проверка — что бинарь запускается и отдаёт usage.
		// CLI без аргументов возвращает 2 и пишет usage в stderr — для нас
		// это «жив», поэтому ловим ExitError отдельно.
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		cmd := exec.CommandContext(ctx, cfg.binPath)
		err := cmd.Run()
		if err != nil {
			var exitErr *exec.ExitError
			if !errors.As(err, &exitErr) {
				http.Error(w, "bin not runnable: "+err.Error(), http.StatusServiceUnavailable)
				return
			}
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}
}

func inspectHandler(cfg config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST required", http.StatusMethodNotAllowed)
			return
		}
		tmp, cleanup, err := saveBodyToTemp(r, "glb-input-*.glb")
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		defer cleanup()

		stdout, stderr, err := runBin(r.Context(), cfg, "inspect", tmp)
		if err != nil {
			writeBinError(w, stderr, err)
			return
		}
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = w.Write(stdout)
	}
}

func exportUVSVGHandler(cfg config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST required", http.StatusMethodNotAllowed)
			return
		}
		inTmp, cleanupIn, err := saveBodyToTemp(r, "glb-input-*.glb")
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		defer cleanupIn()

		outFile, cleanupOut, err := newTempFile("glb-uv-*.svg")
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer cleanupOut()

		args := []string{"export-uv-svg", inTmp, outFile}
		args = append(args, exportUVSVGFlags(r)...)
		_, stderr, err := runBin(r.Context(), cfg, args...)
		if err != nil {
			writeBinError(w, stderr, err)
			return
		}

		data, err := os.ReadFile(outFile)
		if err != nil {
			http.Error(w, "could not read CLI output: "+err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "image/svg+xml; charset=utf-8")
		_, _ = w.Write(data)
	}
}

func exportPrintKitHandler(cfg config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST required", http.StatusMethodNotAllowed)
			return
		}
		glbPath, params, cleanupBody, err := readPrintKitBody(r)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		defer cleanupBody()
		runAndStreamPrintKit(w, r, cfg, glbPath, params)
	}
}

// /by-model/{name}/export-print-kit или /by-model/{name}/inspect.
// Имя модели обязано существовать как файл <modelsDir>/<name>.glb.
func byModelHandler(cfg config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// /by-model/{name}/<action>
		path := strings.TrimPrefix(r.URL.Path, "/by-model/")
		parts := strings.SplitN(path, "/", 2)
		if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
			http.Error(w, "expected /by-model/{name}/{action}", http.StatusBadRequest)
			return
		}
		modelName, action := parts[0], parts[1]
		if strings.ContainsAny(modelName, "/\\.") {
			http.Error(w, "invalid model name", http.StatusBadRequest)
			return
		}
		glbPath := filepath.Join(cfg.modelsDir, modelName+".glb")
		if _, err := os.Stat(glbPath); err != nil {
			http.Error(w, "model not found: "+modelName, http.StatusNotFound)
			return
		}

		switch action {
		case "inspect":
			stdout, stderr, err := runBin(r.Context(), cfg, "inspect", glbPath)
			if err != nil {
				writeBinError(w, stderr, err)
				return
			}
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			_, _ = w.Write(stdout)
		case "export-uv-svg":
			outFile, cleanup, err := newTempFile("glb-uv-*.svg")
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			defer cleanup()
			args := []string{"export-uv-svg", glbPath, outFile}
			args = append(args, exportUVSVGFlags(r)...)
			_, stderr, err := runBin(r.Context(), cfg, args...)
			if err != nil {
				writeBinError(w, stderr, err)
				return
			}
			data, err := os.ReadFile(outFile)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "image/svg+xml; charset=utf-8")
			_, _ = w.Write(data)
		case "export-print-kit":
			params, err := readPrintKitJSONParams(r)
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			runAndStreamPrintKit(w, r, cfg, glbPath, params)
		default:
			http.Error(w, "unknown action: "+action, http.StatusBadRequest)
		}
	}
}

// ─────────────────────── helpers: запуск CLI ───────────────────────────

func runBin(parent context.Context, cfg config, args ...string) (stdout, stderr []byte, err error) {
	ctx, cancel := context.WithTimeout(parent, cfg.execTO)
	defer cancel()

	cmd := exec.CommandContext(ctx, cfg.binPath, args...)
	var outBuf, errBuf strings.Builder
	cmd.Stdout = &captureWriter{&outBuf}
	cmd.Stderr = &captureWriter{&errBuf}
	err = cmd.Run()
	return []byte(outBuf.String()), []byte(errBuf.String()), err
}

type captureWriter struct{ b *strings.Builder }

func (w *captureWriter) Write(p []byte) (int, error) { return w.b.Write(p) }

func writeBinError(w http.ResponseWriter, stderr []byte, err error) {
	msg := strings.TrimSpace(string(stderr))
	if msg == "" {
		msg = err.Error()
	}
	log.Printf("glb_unwrapper exec failed: %v / stderr=%q", err, msg)
	http.Error(w, msg, http.StatusUnprocessableEntity)
}

// ─────────────────────── helpers: тело/файлы ───────────────────────────

func saveBodyToTemp(r *http.Request, pattern string) (string, func(), error) {
	r.Body = http.MaxBytesReader(nil, r.Body, maxBodyBytes)
	f, err := os.CreateTemp("", pattern)
	if err != nil {
		return "", func() {}, err
	}
	if _, err := io.Copy(f, r.Body); err != nil {
		_ = f.Close()
		_ = os.Remove(f.Name())
		return "", func() {}, fmt.Errorf("read body: %w", err)
	}
	if err := f.Close(); err != nil {
		_ = os.Remove(f.Name())
		return "", func() {}, err
	}
	cleanup := func() { _ = os.Remove(f.Name()) }
	return f.Name(), cleanup, nil
}

func newTempFile(pattern string) (string, func(), error) {
	f, err := os.CreateTemp("", pattern)
	if err != nil {
		return "", func() {}, err
	}
	name := f.Name()
	_ = f.Close()
	cleanup := func() { _ = os.Remove(name) }
	return name, cleanup, nil
}

func newTempDir(pattern string) (string, func(), error) {
	dir, err := os.MkdirTemp("", pattern)
	if err != nil {
		return "", func() {}, err
	}
	cleanup := func() { _ = os.RemoveAll(dir) }
	return dir, cleanup, nil
}

// ─────────────────────── print-kit: парсинг параметров ─────────────────

// printKitParams — JSON, который шлёт backend. Все размеры в миллиметрах.
type printKitParams struct {
	BodyDiameterMM     *float64 `json:"body_diameter_mm,omitempty"`
	BodyHeightMM       *float64 `json:"body_height_mm,omitempty"`
	CapDiameterMM      *float64 `json:"cap_diameter_mm,omitempty"`
	CapSideHeightMM    *float64 `json:"cap_side_height_mm,omitempty"`
	BleedMM            *float64 `json:"bleed_mm,omitempty"`
	SafeMM             *float64 `json:"safe_mm,omitempty"`
	NotebookWidthMM    *float64 `json:"notebook_width_mm,omitempty"`
	NotebookHeightMM   *float64 `json:"notebook_height_mm,omitempty"`
	NotebookSpineMM    *float64 `json:"notebook_spine_mm,omitempty"`
	PowerbankWidthMM   *float64 `json:"powerbank_width_mm,omitempty"`
	PowerbankHeightMM  *float64 `json:"powerbank_height_mm,omitempty"`
}

func (p printKitParams) toCLIArgs() []string {
	var args []string
	add := func(flag string, v *float64) {
		if v != nil {
			args = append(args, flag, fmt.Sprintf("%g", *v))
		}
	}
	add("--body-diameter-mm", p.BodyDiameterMM)
	add("--body-height-mm", p.BodyHeightMM)
	add("--cap-diameter-mm", p.CapDiameterMM)
	add("--cap-side-height-mm", p.CapSideHeightMM)
	add("--bleed-mm", p.BleedMM)
	add("--safe-mm", p.SafeMM)
	add("--notebook-width-mm", p.NotebookWidthMM)
	add("--notebook-height-mm", p.NotebookHeightMM)
	add("--notebook-spine-mm", p.NotebookSpineMM)
	add("--powerbank-width-mm", p.PowerbankWidthMM)
	add("--powerbank-height-mm", p.PowerbankHeightMM)
	return args
}

// readPrintKitBody: multipart с полями `glb` (файл) и `params` (JSON).
func readPrintKitBody(r *http.Request) (glbPath string, params printKitParams, cleanup func(), err error) {
	if err := r.ParseMultipartForm(maxBodyBytes); err != nil {
		return "", printKitParams{}, func() {}, fmt.Errorf("parse multipart: %w", err)
	}
	fh, _, err := r.FormFile("glb")
	if err != nil {
		return "", printKitParams{}, func() {}, fmt.Errorf("missing 'glb' file: %w", err)
	}
	defer fh.Close()

	f, err := os.CreateTemp("", "glb-input-*.glb")
	if err != nil {
		return "", printKitParams{}, func() {}, err
	}
	if _, err := io.Copy(f, fh); err != nil {
		_ = f.Close()
		_ = os.Remove(f.Name())
		return "", printKitParams{}, func() {}, err
	}
	_ = f.Close()
	cleanup = func() { _ = os.Remove(f.Name()) }

	if raw := r.FormValue("params"); raw != "" {
		if err := json.Unmarshal([]byte(raw), &params); err != nil {
			cleanup()
			return "", printKitParams{}, func() {}, fmt.Errorf("parse params JSON: %w", err)
		}
	}
	return f.Name(), params, cleanup, nil
}

func readPrintKitJSONParams(r *http.Request) (printKitParams, error) {
	var p printKitParams
	if r.ContentLength == 0 {
		return p, nil
	}
	body, err := io.ReadAll(http.MaxBytesReader(nil, r.Body, 64*1024))
	if err != nil {
		return p, fmt.Errorf("read params body: %w", err)
	}
	if len(body) == 0 {
		return p, nil
	}
	if err := json.Unmarshal(body, &p); err != nil {
		return p, fmt.Errorf("parse params JSON: %w", err)
	}
	return p, nil
}

func runAndStreamPrintKit(w http.ResponseWriter, r *http.Request, cfg config, glbPath string, params printKitParams) {
	outDir, cleanup, err := newTempDir("glb-printkit-*")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer cleanup()

	args := []string{"export-print-kit", glbPath, outDir}
	args = append(args, params.toCLIArgs()...)
	_, stderr, err := runBin(r.Context(), cfg, args...)
	if err != nil {
		writeBinError(w, stderr, err)
		return
	}
	if err := streamDirAsZip(w, outDir); err != nil {
		log.Printf("zip stream failed: %v", err)
	}
}

func streamDirAsZip(w http.ResponseWriter, dir string) error {
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `attachment; filename="print-kit.zip"`)
	zw := zip.NewWriter(w)
	defer zw.Close()

	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		full := filepath.Join(dir, e.Name())
		data, err := os.ReadFile(full)
		if err != nil {
			return err
		}
		fw, err := zw.Create(e.Name())
		if err != nil {
			return err
		}
		if _, err := fw.Write(data); err != nil {
			return err
		}
	}
	return nil
}

// ─────────────────────── flags для export-uv-svg ───────────────────────

func exportUVSVGFlags(r *http.Request) []string {
	q := r.URL.Query()
	var args []string
	if v := q.Get("mesh"); v != "" {
		args = append(args, "--mesh", v)
	}
	if v := q.Get("primitive"); v != "" {
		args = append(args, "--primitive", v)
	}
	if v := q.Get("stroke"); v != "" {
		args = append(args, "--stroke", v)
	}
	if v := q.Get("fill"); v != "" {
		args = append(args, "--fill", v)
	}
	if v := q.Get("width"); v != "" {
		args = append(args, "--width", v)
	}
	if v := q.Get("height"); v != "" {
		args = append(args, "--height", v)
	}
	if v := q.Get("margin"); v != "" {
		args = append(args, "--margin", v)
	}
	if q.Get("flipV") == "false" {
		args = append(args, "--no-flip-v")
	}
	return args
}

// ─────────────────────── middleware ────────────────────────────────────

func withLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := &statusWriter{ResponseWriter: w, status: 200}
		next.ServeHTTP(ww, r)
		log.Printf("%s %s -> %d (%s)", r.Method, r.URL.Path, ww.status, time.Since(start))
	})
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (s *statusWriter) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}
