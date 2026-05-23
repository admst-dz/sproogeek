#pragma once

#include "glb_reader.hpp"

#include <string>

namespace glb_unwrapper {

struct PrintKitOptions {
    std::string product = "thermos";
    double body_diameter_mm = 70.0;
    double body_height_mm = 190.0;
    double cap_diameter_mm = 55.0;
    double cap_side_height_mm = 35.0;
    double width_mm = 145.0;
    double height_mm = 210.0;
    double depth_mm = 22.0;
    double spine_thickness_mm = 12.0;
    double bleed_mm = 3.0;
    double safe_mm = 3.0;
    double page_margin_mm = 12.0;
    double gap_mm = 16.0;
    double label_height_mm = 10.0;
    bool body_diameter_set = false;
    bool body_height_set = false;
    bool cap_diameter_set = false;
    bool cap_side_height_set = false;
    bool width_set = false;
    bool height_set = false;
    bool depth_set = false;
    bool spine_thickness_set = false;
};

bool print_kit_is_calibrated(const PrintKitOptions& options);
void export_print_kit(
    const std::string& input,
    const GlbData& glb,
    const Model& model,
    const std::string& output_dir,
    const PrintKitOptions& options
);

} // namespace glb_unwrapper
