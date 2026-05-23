#include "print_kit.hpp"

#include "accessor_reader.hpp"
#include "format.hpp"

#include <algorithm>
#include <cmath>
#include <exception>
#include <filesystem>
#include <sstream>
#include <utility>
#include <vector>

namespace glb_unwrapper {
namespace {

constexpr double PI = 3.14159265358979323846;

struct TemplatePart {
    std::string id;
    std::string title;
    std::string kind;
    double x = 0.0;
    double y = 0.0;
    double width = 0.0;
    double height = 0.0;
    double radius = 0.0;
    std::string spec_id;
    std::string spec_type;
    double diameter = 0.0;
    std::string note;
    std::vector<double> guide_offsets;
};

double circumference(double diameter) {
    return PI * diameter;
}

std::string product_label(const PrintKitOptions& options) {
    if (options.product == "notebook") {
        return "NOTEBOOK";
    }
    if (options.product == "powerbank") {
        return "POWERBANK";
    }
    return "THERMOS";
}

std::vector<TemplatePart> build_template_parts(const PrintKitOptions& options) {
    const double bleed = options.bleed_mm;
    const double x = options.page_margin_mm + bleed;
    double y = options.page_margin_mm + options.label_height_mm + bleed;

    std::vector<TemplatePart> parts;
    if (options.product == "notebook") {
        TemplatePart cover;
        cover.id = "ARTWORK_NOTEBOOK_COVER_WRAP";
        cover.title = "Обложка ежедневника / NOTEBOOK COVER WRAP";
        cover.kind = "wrap-rectangle";
        cover.x = x;
        cover.y = y;
        cover.width = options.width_mm * 2.0 + options.spine_thickness_mm;
        cover.height = options.height_mm;
        cover.spec_id = "notebook_cover_wrap";
        cover.spec_type = "rectangle";
        cover.note = "back cover + spine + front cover";
        cover.guide_offsets = {options.width_mm, options.width_mm + options.spine_thickness_mm};
        parts.push_back(std::move(cover));
        return parts;
    }

    if (options.product == "powerbank") {
        parts.push_back({
            "ARTWORK_POWERBANK_OUTER",
            "Повербанк внешняя сторона / POWERBANK OUTER SIDE",
            "flat-rectangle",
            x,
            y,
            options.width_mm,
            options.height_mm,
            0.0,
            "powerbank_outer",
            "rectangle",
            0.0,
            "main printable side",
            {},
        });
        y += options.height_mm + 2 * bleed + options.gap_mm + options.label_height_mm;
        parts.push_back({
            "ARTWORK_POWERBANK_CHARGING",
            "Повербанк сторона разъёмов / POWERBANK CHARGING SIDE",
            "flat-rectangle",
            x,
            y,
            options.width_mm,
            options.height_mm,
            0.0,
            "powerbank_charging",
            "rectangle",
            0.0,
            "side with charging details",
            {},
        });
        return parts;
    }

    const double body_width = circumference(options.body_diameter_mm);
    const double cap_side_width = circumference(options.cap_diameter_mm);
    const double cap_top_size = options.cap_diameter_mm;

    parts.push_back({
        "ARTWORK_BODY_WRAP",
        "Корпус термоса / BODY WRAP",
        "wrap-rectangle",
        x,
        y,
        body_width,
        options.body_height_mm,
        0.0,
        "body_wrap",
        "rectangle",
        options.body_diameter_mm,
        "",
        {},
    });
    y += options.body_height_mm + 2 * bleed + options.gap_mm + options.label_height_mm;
    parts.push_back({
        "ARTWORK_CAP_SIDE_WRAP",
        "Бок крышки / CAP SIDE WRAP",
        "wrap-rectangle",
        x,
        y,
        cap_side_width,
        options.cap_side_height_mm,
        0.0,
        "cap_side_wrap",
        "rectangle",
        options.cap_diameter_mm,
        "",
        {},
    });
    y += options.cap_side_height_mm + 2 * bleed + options.gap_mm + options.label_height_mm;
    parts.push_back({
        "ARTWORK_CAP_TOP",
        "Верх крышки / CAP TOP",
        "circle",
        x,
        y,
        cap_top_size,
        cap_top_size,
        cap_top_size / 2.0,
        "cap_top",
        "circle",
        options.cap_diameter_mm,
        "",
        {},
    });
    return parts;
}

std::string style_text() {
    return R"(  <style>
    .label { font: 4px Arial, sans-serif; fill: #222; }
    .small { font: 3px Arial, sans-serif; fill: #555; }
    .cut { fill: none; stroke: #ff00ff; stroke-width: 0.15; }
    .bleed { fill: #ff00ff; fill-opacity: 0.035; stroke: #ff00ff; stroke-width: 0.12; stroke-dasharray: 1.5 1.2; }
    .safe { fill: none; stroke: #0085ff; stroke-width: 0.12; stroke-dasharray: 1.2 1.2; }
    .artwork { fill: #000000; fill-opacity: 0.018; stroke: #999; stroke-width: 0.08; }
    .guide { fill: none; stroke: #666; stroke-width: 0.12; stroke-dasharray: 2 1.2; }
    .mark { fill: none; stroke: #000; stroke-width: 0.12; }
  </style>
)";
}

void svg_rect(std::ostringstream& svg, const std::string& klass, double x, double y, double w, double h) {
    svg << "    <rect class=\"" << klass << "\" x=\"" << format_number(x) << "\" y=\"" << format_number(y)
        << "\" width=\"" << format_number(w) << "\" height=\"" << format_number(h) << "\"/>\n";
}

void svg_circle(std::ostringstream& svg, const std::string& klass, double cx, double cy, double r) {
    svg << "    <circle class=\"" << klass << "\" cx=\"" << format_number(cx) << "\" cy=\"" << format_number(cy)
        << "\" r=\"" << format_number(r) << "\"/>\n";
}

void svg_label(std::ostringstream& svg, const std::string& klass, double x, double y, const std::string& text) {
    svg << "    <text class=\"" << klass << "\" x=\"" << format_number(x) << "\" y=\"" << format_number(y)
        << "\">" << xml_escape(text) << "</text>\n";
}

void registration_mark(std::ostringstream& svg, double x, double y, double size) {
    const double r = size * 0.42;
    svg << "    <g class=\"mark\">\n";
    svg << "      <circle cx=\"" << format_number(x) << "\" cy=\"" << format_number(y) << "\" r=\"" << format_number(r) << "\"/>\n";
    svg << "      <path d=\"M " << format_number(x - size) << " " << format_number(y)
        << " L " << format_number(x + size) << " " << format_number(y) << "\"/>\n";
    svg << "      <path d=\"M " << format_number(x) << " " << format_number(y - size)
        << " L " << format_number(x) << " " << format_number(y + size) << "\"/>\n";
    svg << "    </g>\n";
}

bool has_fold_guides(const std::vector<TemplatePart>& parts) {
    return std::any_of(parts.begin(), parts.end(), [](const TemplatePart& part) {
        return !part.guide_offsets.empty();
    });
}

std::string export_print_template_svg(const PrintKitOptions& options) {
    const double bleed = options.bleed_mm;
    const double safe = options.safe_mm;
    const std::vector<TemplatePart> parts = build_template_parts(options);

    double content_width = 0.0;
    double content_bottom = 0.0;
    for (const TemplatePart& part : parts) {
        content_width = std::max(content_width, part.kind == "circle" ? part.radius * 2.0 : part.width);
        content_bottom = std::max(content_bottom, part.y + (part.kind == "circle" ? part.radius * 2.0 : part.height));
    }
    const double page_width = content_width + 2 * options.page_margin_mm + 2 * bleed;
    const double page_height = content_bottom + options.page_margin_mm + bleed;

    std::ostringstream svg;
    svg << "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n";
    svg << "<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:inkscape=\"http://www.inkscape.org/namespaces/inkscape\" width=\"" << format_number(page_width)
        << "mm\" height=\"" << format_number(page_height) << "mm\" viewBox=\"0 0 "
        << format_number(page_width) << " " << format_number(page_height) << "\">\n";
    svg << style_text();
    svg << "  <metadata>Print template generated by glb_unwrapper. Units are millimeters. "
        << "Place production artwork inside ARTWORK_* groups. Convert final artwork to CMYK/Pantone in prepress software.</metadata>\n";
    svg << "  <rect x=\"0\" y=\"0\" width=\"" << format_number(page_width) << "\" height=\""
        << format_number(page_height) << "\" fill=\"white\"/>\n";

    svg << "  <g id=\"INFO\" inkscape:groupmode=\"layer\" inkscape:label=\"00_INFO\">\n";
    svg_label(svg, "label", options.page_margin_mm, 7.0, "SPRUZHYK " + product_label(options) + " PRINT TEMPLATE");
    svg_label(svg, "small", options.page_margin_mm, 12.0,
        print_kit_is_calibrated(options) ? "Status: calibrated dimensions from CLI options" : "Status: starter dimensions; calibrate physical measurements before production");
    svg_label(svg, "small", options.page_margin_mm, 17.0,
        "Bleed " + format_number(bleed) + " mm, safe area " + format_number(safe) + " mm, cut contour magenta");
    svg << "  </g>\n";

    svg << "  <g id=\"LABELS\" inkscape:groupmode=\"layer\" inkscape:label=\"01_LABELS\">\n";
    for (const TemplatePart& part : parts) {
        if (part.kind == "circle") {
            svg_label(svg, "label", part.x - bleed, part.y - bleed - 3.0, part.title);
            svg_label(svg, "small", part.x - bleed, part.y - bleed + 2.0,
                "trim diameter " + format_number(part.radius * 2.0) + " mm");
        } else {
            svg_label(svg, "label", part.x - bleed, part.y - bleed - 3.0, part.title);
            svg_label(svg, "small", part.x - bleed, part.y - bleed + 2.0,
                "trim " + format_number(part.width) + " x " + format_number(part.height) + " mm");
        }
    }
    svg << "  </g>\n";

    svg << "  <g id=\"ARTWORK\" inkscape:groupmode=\"layer\" inkscape:label=\"02_ARTWORK_PLACE_DESIGN_HERE\">\n";
    for (const TemplatePart& part : parts) {
        svg << "    <g id=\"" << part.id << "\" data-kind=\"" << part.kind << "\">\n";
        svg << "      <!-- Place final artwork for this print zone in this group. -->\n";
        if (part.kind == "circle") {
            svg_circle(svg, "artwork", part.x + part.radius, part.y + part.radius, part.radius);
        } else {
            svg_rect(svg, "artwork", part.x, part.y, part.width, part.height);
        }
        svg << "    </g>\n";
    }
    svg << "  </g>\n";

    svg << "  <g id=\"WHITE_UNDERBASE\" inkscape:groupmode=\"layer\" inkscape:label=\"03_WHITE_UNDERBASE\" opacity=\"0.35\">\n";
    svg << "    <!-- Put white underbase shapes here for dark/colored materials. Keep aligned with artwork. -->\n";
    svg << "  </g>\n";
    svg << "  <g id=\"VARNISH_OR_SPECIAL_FINISH\" inkscape:groupmode=\"layer\" inkscape:label=\"04_VARNISH_OR_SPECIAL_FINISH\" opacity=\"0.35\">\n";
    svg << "    <!-- Put varnish, foil or special ink masks here when production needs them. -->\n";
    svg << "  </g>\n";

    svg << "  <g id=\"BLEED\" inkscape:groupmode=\"layer\" inkscape:label=\"90_BLEED_DO_NOT_PRINT_AS_ARTWORK\">\n";
    for (const TemplatePart& part : parts) {
        if (part.kind == "circle") {
            svg_circle(svg, "bleed", part.x + part.radius, part.y + part.radius, part.radius + bleed);
        } else {
            svg_rect(svg, "bleed", part.x - bleed, part.y - bleed, part.width + 2 * bleed, part.height + 2 * bleed);
        }
    }
    svg << "  </g>\n";

    svg << "  <g id=\"SAFE_AREA\" inkscape:groupmode=\"layer\" inkscape:label=\"91_SAFE_AREA_DO_NOT_PRINT\">\n";
    for (const TemplatePart& part : parts) {
        if (part.kind == "circle") {
            svg_circle(svg, "safe", part.x + part.radius, part.y + part.radius, std::max(0.0, part.radius - safe));
        } else {
            svg_rect(svg, "safe", part.x + safe, part.y + safe, std::max(0.0, part.width - 2 * safe), std::max(0.0, part.height - 2 * safe));
        }
    }
    svg << "  </g>\n";

    if (has_fold_guides(parts)) {
        svg << "  <g id=\"FOLD_GUIDES\" inkscape:groupmode=\"layer\" inkscape:label=\"91B_FOLD_GUIDES_DO_NOT_PRINT\">\n";
        for (const TemplatePart& part : parts) {
            for (double offset : part.guide_offsets) {
                const double gx = part.x + offset;
                svg << "    <path class=\"guide\" d=\"M " << format_number(gx) << " " << format_number(part.y - bleed)
                    << " L " << format_number(gx) << " " << format_number(part.y + part.height + bleed)
                    << "\"/>\n";
            }
        }
        svg << "  </g>\n";
    }

    svg << "  <g id=\"CUT_CONTOUR\" inkscape:groupmode=\"layer\" inkscape:label=\"92_CUT_CONTOUR_SPOT_MAGENTA\">\n";
    for (const TemplatePart& part : parts) {
        if (part.kind == "circle") {
            svg_circle(svg, "cut", part.x + part.radius, part.y + part.radius, part.radius);
        } else {
            svg_rect(svg, "cut", part.x, part.y, part.width, part.height);
        }
    }
    svg << "  </g>\n";

    svg << "  <g id=\"REGISTRATION_MARKS\" inkscape:groupmode=\"layer\" inkscape:label=\"93_REGISTRATION_MARKS\">\n";
    registration_mark(svg, options.page_margin_mm / 2.0, options.page_margin_mm / 2.0, 3.0);
    registration_mark(svg, page_width - options.page_margin_mm / 2.0, options.page_margin_mm / 2.0, 3.0);
    registration_mark(svg, options.page_margin_mm / 2.0, page_height - options.page_margin_mm / 2.0, 3.0);
    registration_mark(svg, page_width - options.page_margin_mm / 2.0, page_height - options.page_margin_mm / 2.0, 3.0);
    svg << "  </g>\n";
    svg << "</svg>\n";
    return svg.str();
}

std::string export_print_spec_json(
    const std::string& input,
    const GlbData& glb,
    const Model& model,
    const PrintKitOptions& options
) {
    std::vector<std::pair<std::string, Bounds>> bounds;
    std::string bounds_warning;
    try {
        bounds = collect_mesh_bounds(glb, model);
    } catch (const std::exception& exc) {
        bounds_warning = exc.what();
    }
    const std::vector<TemplatePart> parts = build_template_parts(options);
    std::ostringstream json;
    json << "{\n";
    json << "  \"source_glb\": \"" << json_escape(input) << "\",\n";
    json << "  \"product\": \"" << json_escape(options.product) << "\",\n";
    json << "  \"units\": \"mm\",\n";
    json << "  \"calibrated_for_production\": " << (print_kit_is_calibrated(options) ? "true" : "false") << ",\n";
    json << "  \"dimensions\": {";
    if (options.product == "notebook") {
        json << "\"width_mm\":" << format_number(options.width_mm)
            << ",\"height_mm\":" << format_number(options.height_mm)
            << ",\"spine_thickness_mm\":" << format_number(options.spine_thickness_mm);
    } else if (options.product == "powerbank") {
        json << "\"width_mm\":" << format_number(options.width_mm)
            << ",\"height_mm\":" << format_number(options.height_mm)
            << ",\"depth_mm\":" << format_number(options.depth_mm);
    } else {
        json << "\"body_diameter_mm\":" << format_number(options.body_diameter_mm)
            << ",\"body_height_mm\":" << format_number(options.body_height_mm)
            << ",\"cap_diameter_mm\":" << format_number(options.cap_diameter_mm)
            << ",\"cap_side_height_mm\":" << format_number(options.cap_side_height_mm);
    }
    json << "},\n";
    json << "  \"prepress\": {\n";
    json << "    \"color_note\": \"SVG is RGB technical template; convert artwork to CMYK/Pantone in prepress software before final PDF/X export.\",\n";
    json << "    \"cut_contour\": \"magenta #ff00ff strokes in CUT_CONTOUR layer\",\n";
    json << "    \"bleed_mm\": " << format_number(options.bleed_mm) << ",\n";
    json << "    \"safe_area_mm\": " << format_number(options.safe_mm) << ",\n";
    json << "    \"min_line_mm\": 0.2,\n";
    json << "    \"recommended_raster_dpi\": 300\n";
    json << "  },\n";
    json << "  \"parts\": [\n";
    for (size_t i = 0; i < parts.size(); ++i) {
        const TemplatePart& part = parts[i];
        json << "    {\"id\":\"" << json_escape(part.spec_id) << "\",\"type\":\"" << json_escape(part.spec_type) << "\"";
        if (part.spec_type == "circle") {
            json << ",\"diameter_mm\":" << format_number(part.diameter);
        } else {
            json << ",\"width_mm\":" << format_number(part.width)
                << ",\"height_mm\":" << format_number(part.height);
            if (part.diameter > 0.0) {
                json << ",\"diameter_mm\":" << format_number(part.diameter);
            }
            if (!part.guide_offsets.empty()) {
                json << ",\"fold_guides_mm\":[";
                for (size_t guide_index = 0; guide_index < part.guide_offsets.size(); ++guide_index) {
                    if (guide_index > 0) {
                        json << ",";
                    }
                    json << format_number(part.guide_offsets[guide_index]);
                }
                json << "]";
            }
        }
        if (!part.note.empty()) {
            json << ",\"note\":\"" << json_escape(part.note) << "\"";
        }
        json << "}";
        if (i + 1 < parts.size()) {
            json << ",";
        }
        json << "\n";
    }
    json << "  ],\n";
    json << "  \"source_mesh_bounds\": [\n";
    for (size_t i = 0; i < bounds.size(); ++i) {
        const auto& item = bounds[i];
        json << "    {\"name\":\"" << json_escape(item.first) << "\",\"valid\":" << (item.second.valid ? "true" : "false")
            << ",\"diameter_xz_model_units\":" << format_number(item.second.diameter_xz())
            << ",\"height_y_model_units\":" << format_number(item.second.height_y()) << "}";
        if (i + 1 < bounds.size()) {
            json << ",";
        }
        json << "\n";
    }
    json << "  ]";
    if (!bounds_warning.empty()) {
        json << ",\n";
        json << "  \"source_mesh_bounds_warning\": \"" << json_escape(bounds_warning) << "\"\n";
    } else {
        json << "\n";
    }
    json << "}\n";
    return json.str();
}

std::string export_print_readme(const PrintKitOptions& options) {
    const std::vector<TemplatePart> parts = build_template_parts(options);
    std::ostringstream out;
    out << "Spruzhyk " << options.product << " print kit\n\n";
    out << "Files:\n";
    out << "- print-template.svg: millimeter template with named print zones.\n";
    out << "- print-spec.json: machine-readable dimensions and prepress notes.\n\n";
    out << "Layer guide:\n";
    for (const TemplatePart& part : parts) {
        out << "- " << part.id << ": put artwork for " << part.title << " here.\n";
    }
    out << "- WHITE_UNDERBASE: optional white base for dark/colored materials.\n";
    out << "- VARNISH_OR_SPECIAL_FINISH: optional mask for varnish, foil or spot effects.\n";
    if (has_fold_guides(parts)) {
        out << "- FOLD_GUIDES: technical spine/fold guides; do not print as artwork.\n";
    }
    out << "- Magenta cut contours are technical and should not print as artwork.\n\n";
    out << "Prepress checklist:\n";
    out << "- Confirm physical measurements before production";
    if (!print_kit_is_calibrated(options)) {
        out << " (current file uses starter dimensions)";
    }
    out << ".\n";
    out << "- Keep artwork extended to bleed: " << format_number(options.bleed_mm) << " mm.\n";
    out << "- Keep important text/logos inside safe area: " << format_number(options.safe_mm) << " mm.\n";
    out << "- Convert final artwork to CMYK/Pantone and export PDF/X in typography software.\n";
    out << "- Raster images should be at least 300 DPI at final physical size.\n";
    return out.str();
}

} // namespace

bool print_kit_is_calibrated(const PrintKitOptions& options) {
    if (options.product == "notebook") {
        return options.width_set && options.height_set && options.spine_thickness_set;
    }
    if (options.product == "powerbank") {
        return options.width_set && options.height_set && options.depth_set;
    }
    return options.body_diameter_set
        && options.body_height_set
        && options.cap_diameter_set
        && options.cap_side_height_set;
}

void export_print_kit(
    const std::string& input,
    const GlbData& glb,
    const Model& model,
    const std::string& output_dir,
    const PrintKitOptions& options
) {
    std::filesystem::create_directories(output_dir);
    write_text_file(output_dir + "/print-template.svg", export_print_template_svg(options));
    write_text_file(output_dir + "/print-spec.json", export_print_spec_json(input, glb, model, options));
    write_text_file(output_dir + "/README-print.txt", export_print_readme(options));
}

} // namespace glb_unwrapper
