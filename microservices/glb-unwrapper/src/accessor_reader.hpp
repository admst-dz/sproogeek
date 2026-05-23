#pragma once

#include "glb_reader.hpp"

#include <cstddef>
#include <cstdint>
#include <limits>
#include <string>
#include <utility>
#include <vector>

namespace glb_unwrapper {

struct Vec2 {
    double u = 0.0;
    double v = 0.0;
};

struct Vec3 {
    double x = 0.0;
    double y = 0.0;
    double z = 0.0;
};

struct Bounds {
    Vec3 min{
        std::numeric_limits<double>::infinity(),
        std::numeric_limits<double>::infinity(),
        std::numeric_limits<double>::infinity(),
    };
    Vec3 max{
        -std::numeric_limits<double>::infinity(),
        -std::numeric_limits<double>::infinity(),
        -std::numeric_limits<double>::infinity(),
    };
    bool valid = false;

    void include(const Vec3& value);
    void include(const Bounds& other);

    double width_x() const;
    double height_y() const;
    double depth_z() const;
    double diameter_xz() const;
    double volume() const;
};

std::vector<Vec2> read_vec2_accessor(const GlbData& glb, const Model& model, int accessor_index);
std::vector<Vec3> read_vec3_accessor(const GlbData& glb, const Model& model, int accessor_index);
std::vector<uint32_t> read_index_accessor(const GlbData& glb, const Model& model, int accessor_index);
std::vector<uint32_t> implicit_indices(size_t count);

Bounds primitive_bounds(const GlbData& glb, const Model& model, const Primitive& primitive);
Bounds mesh_bounds(const GlbData& glb, const Model& model, const Mesh& mesh);
std::vector<std::pair<std::string, Bounds>> collect_mesh_bounds(const GlbData& glb, const Model& model);

} // namespace glb_unwrapper
