#include "cli.hpp"

#include "error.hpp"
#include "glb_reader.hpp"
#include "print_kit.hpp"
#include "uv_exporter.hpp"

#include <algorithm>
#include <cctype>
#include <iostream>
#include <string>

namespace glb_unwrapper {
namespace {

void print_inspect(const GlbData& glb, const Model& model) {
    const Json* asset = glb.root.find("asset");
    std::cout << "GLB summary\n";
    if (asset && asset->is_object()) {
        std::cout << "  generator: " << (asset->find("generator") ? asset->at("generator").as_string("-") : "-") << "\n";
        std::cout << "  version: " << (asset->find("version") ? asset->at("version").as_string("-") : "-") << "\n";
    }
    std::cout << "  bin bytes: " << glb.bin.size() << "\n";
    std::cout << "  bufferViews: " << model.buffer_views.size() << "\n";
    std::cout << "  accessors: " << model.accessors.size() << "\n";
    std::cout << "  meshes: " << model.meshes.size() << "\n";

    for (size_t mesh_index = 0; mesh_index < model.meshes.size(); ++mesh_index) {
        const Mesh& mesh = model.meshes[mesh_index];
        std::cout << "\nmesh[" << mesh_index << "] " << mesh.name << "\n";
        for (size_t primitive_index = 0; primitive_index < mesh.primitives.size(); ++primitive_index) {
            const Primitive& primitive = mesh.primitives[primitive_index];
            size_t vertices = 0;
            size_t indices = 0;
            size_t uvs = 0;
            if (primitive.position_accessor >= 0) {
                vertices = model.accessors[static_cast<size_t>(primitive.position_accessor)].count;
            }
            if (primitive.index_accessor >= 0) {
                indices = model.accessors[static_cast<size_t>(primitive.index_accessor)].count;
            }
            if (primitive.uv_accessor >= 0) {
                uvs = model.accessors[static_cast<size_t>(primitive.uv_accessor)].count;
            }
            std::cout << "  primitive[" << primitive_index << "]"
                << " mode=" << primitive.mode
                << " vertices=" << vertices
                << " indices=" << indices
                << " texcoord0=" << (primitive.uv_accessor >= 0 ? "yes" : "no")
                << " uvCount=" << uvs
                << " material=" << primitive.material
                << "\n";
        }
    }
}

void usage() {
    std::cerr
        << "Usage:\n"
        << "  glb_unwrapper inspect <input.glb>\n"
        << "  glb_unwrapper export-uv-svg <input.glb> <output.svg> [options]\n\n"
        << "  glb_unwrapper export-print-kit <input.glb> <output-dir> [options]\n\n"
        << "Options for export-uv-svg:\n"
        << "  --width <px>         SVG width, default 4096\n"
        << "  --height <px>        SVG height, default 4096\n"
        << "  --margin <px>        SVG margin, default 0\n"
        << "  --mesh <index|name>  Export one mesh\n"
        << "  --primitive <index>  Export one primitive\n"
        << "  --stroke <color>     UV stroke color, default #111111\n"
        << "  --fill <color>       UV fill color, default none\n"
        << "  --no-flip-v          Keep glTF V orientation\n\n"
        << "Options for export-print-kit:\n"
        << "  --product <kind>           thermos, notebook, or powerbank; default thermos\n"
        << "  --body-diameter-mm <mm>    Thermos body diameter\n"
        << "  --body-height-mm <mm>      Thermos printable body height\n"
        << "  --cap-diameter-mm <mm>     Thermos cap diameter\n"
        << "  --cap-side-height-mm <mm>  Thermos printable cap side height\n"
        << "  --width-mm <mm>            Notebook/powerbank width\n"
        << "  --height-mm <mm>           Notebook/powerbank height\n"
        << "  --depth-mm <mm>            Powerbank depth\n"
        << "  --spine-thickness-mm <mm>  Notebook spine thickness\n"
        << "  --bleed-mm <mm>            Bleed around trim, default 3\n"
        << "  --safe-mm <mm>             Safe area inset, default 3\n"
        << "  --page-margin-mm <mm>      Page margin, default 12\n"
        << "  --gap-mm <mm>              Gap between parts, default 16\n";
}

int parse_int_arg(const std::string& flag, const std::string& value) {
    try {
        return std::stoi(value);
    } catch (...) {
        throw Error("Invalid integer for " + flag + ": " + value);
    }
}

double parse_double_arg(const std::string& flag, const std::string& value) {
    try {
        return std::stod(value);
    } catch (...) {
        throw Error("Invalid number for " + flag + ": " + value);
    }
}

std::string lower_arg(std::string value) {
    std::transform(value.begin(), value.end(), value.begin(), [](unsigned char c) {
        return static_cast<char>(std::tolower(c));
    });
    return value;
}

ExportOptions parse_export_options(int argc, char** argv, int start) {
    ExportOptions options;
    for (int i = start; i < argc; ++i) {
        const std::string arg = argv[i];
        auto require_value = [&](const std::string& flag) -> std::string {
            if (i + 1 >= argc) {
                throw Error("Missing value for " + flag);
            }
            return argv[++i];
        };

        if (arg == "--width") {
            options.width = parse_int_arg(arg, require_value(arg));
        } else if (arg == "--height") {
            options.height = parse_int_arg(arg, require_value(arg));
        } else if (arg == "--margin") {
            options.margin = parse_int_arg(arg, require_value(arg));
        } else if (arg == "--mesh") {
            options.mesh_filter = require_value(arg);
        } else if (arg == "--primitive") {
            options.primitive_filter = parse_int_arg(arg, require_value(arg));
        } else if (arg == "--stroke") {
            options.stroke = require_value(arg);
        } else if (arg == "--fill") {
            options.fill = require_value(arg);
        } else if (arg == "--no-flip-v") {
            options.flip_v = false;
        } else {
            throw Error("Unknown option: " + arg);
        }
    }
    if (options.width <= 0 || options.height <= 0 || options.margin < 0) {
        throw Error("Invalid export dimensions");
    }
    return options;
}

PrintKitOptions parse_print_kit_options(int argc, char** argv, int start) {
    PrintKitOptions options;
    for (int i = start; i < argc; ++i) {
        const std::string arg = argv[i];
        auto require_value = [&](const std::string& flag) -> std::string {
            if (i + 1 >= argc) {
                throw Error("Missing value for " + flag);
            }
            return argv[++i];
        };

        if (arg == "--product") {
            options.product = lower_arg(require_value(arg));
        } else if (arg == "--body-diameter-mm") {
            options.body_diameter_mm = parse_double_arg(arg, require_value(arg));
            options.body_diameter_set = true;
        } else if (arg == "--body-height-mm") {
            options.body_height_mm = parse_double_arg(arg, require_value(arg));
            options.body_height_set = true;
        } else if (arg == "--cap-diameter-mm") {
            options.cap_diameter_mm = parse_double_arg(arg, require_value(arg));
            options.cap_diameter_set = true;
        } else if (arg == "--cap-side-height-mm") {
            options.cap_side_height_mm = parse_double_arg(arg, require_value(arg));
            options.cap_side_height_set = true;
        } else if (arg == "--width-mm") {
            options.width_mm = parse_double_arg(arg, require_value(arg));
            options.width_set = true;
        } else if (arg == "--height-mm") {
            options.height_mm = parse_double_arg(arg, require_value(arg));
            options.height_set = true;
        } else if (arg == "--depth-mm") {
            options.depth_mm = parse_double_arg(arg, require_value(arg));
            options.depth_set = true;
        } else if (arg == "--spine-thickness-mm") {
            options.spine_thickness_mm = parse_double_arg(arg, require_value(arg));
            options.spine_thickness_set = true;
        } else if (arg == "--bleed-mm") {
            options.bleed_mm = parse_double_arg(arg, require_value(arg));
        } else if (arg == "--safe-mm") {
            options.safe_mm = parse_double_arg(arg, require_value(arg));
        } else if (arg == "--page-margin-mm") {
            options.page_margin_mm = parse_double_arg(arg, require_value(arg));
        } else if (arg == "--gap-mm") {
            options.gap_mm = parse_double_arg(arg, require_value(arg));
        } else {
            throw Error("Unknown option: " + arg);
        }
    }

    if (options.product != "thermos" && options.product != "notebook" && options.product != "powerbank") {
        throw Error("Unsupported product for print kit: " + options.product);
    }
    if (options.product == "thermos"
        && (options.body_diameter_mm <= 0 || options.body_height_mm <= 0
            || options.cap_diameter_mm <= 0 || options.cap_side_height_mm <= 0)) {
        throw Error("Thermos print dimensions must be positive");
    }
    if (options.product == "notebook"
        && (options.width_mm <= 0 || options.height_mm <= 0 || options.spine_thickness_mm <= 0)) {
        throw Error("Notebook print dimensions must be positive");
    }
    if (options.product == "powerbank"
        && (options.width_mm <= 0 || options.height_mm <= 0 || options.depth_mm <= 0)) {
        throw Error("Powerbank print dimensions must be positive");
    }
    if (options.bleed_mm < 0 || options.safe_mm < 0 || options.page_margin_mm < 0 || options.gap_mm < 0) {
        throw Error("Print margins must not be negative");
    }
    return options;
}

} // namespace

int run_cli(int argc, char** argv) {
    try {
        if (argc < 3) {
            usage();
            return 2;
        }

        const std::string command = argv[1];
        const std::string input = argv[2];
        GlbData glb = load_glb(input);
        Model model = parse_model(glb.root);

        if (command == "inspect") {
            print_inspect(glb, model);
            return 0;
        }

        if (command == "export-uv-svg") {
            if (argc < 4) {
                usage();
                return 2;
            }
            const std::string output = argv[3];
            ExportOptions options = parse_export_options(argc, argv, 4);
            write_text_file(output, export_uv_svg(glb, model, options));
            std::cout << "Wrote UV SVG: " << output << "\n";
            return 0;
        }

        if (command == "export-print-kit") {
            if (argc < 4) {
                usage();
                return 2;
            }
            const std::string output_dir = argv[3];
            PrintKitOptions options = parse_print_kit_options(argc, argv, 4);
            export_print_kit(input, glb, model, output_dir, options);
            std::cout << "Wrote print kit: " << output_dir << "\n";
            if (!print_kit_is_calibrated(options)) {
                std::cout << "Warning: starter dimensions were used. Calibrate physical dimensions before production.\n";
            }
            return 0;
        }

        usage();
        return 2;
    } catch (const std::exception& exc) {
        std::cerr << "error: " << exc.what() << "\n";
        return 1;
    }
}

} // namespace glb_unwrapper
