#pragma once

#include "glb_reader.hpp"

#include <string>

namespace glb_unwrapper {

struct ExportOptions {
    int width = 4096;
    int height = 4096;
    int margin = 0;
    bool flip_v = true;
    std::string stroke = "#111111";
    std::string fill = "none";
    std::string mesh_filter;
    int primitive_filter = -1;
};

std::string export_uv_svg(const GlbData& glb, const Model& model, const ExportOptions& options);

} // namespace glb_unwrapper
