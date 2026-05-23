#include "accessor_reader.hpp"

#include "error.hpp"

#include <algorithm>
#include <cstring>

namespace glb_unwrapper {
namespace {

size_t component_size(int component_type) {
    switch (component_type) {
        case 5120:
        case 5121:
            return 1;
        case 5122:
        case 5123:
            return 2;
        case 5125:
        case 5126:
            return 4;
        default:
            throw Error("Unsupported accessor component type: " + std::to_string(component_type));
    }
}

size_t component_count(const std::string& type) {
    if (type == "SCALAR") return 1;
    if (type == "VEC2") return 2;
    if (type == "VEC3") return 3;
    if (type == "VEC4") return 4;
    if (type == "MAT2") return 4;
    if (type == "MAT3") return 9;
    if (type == "MAT4") return 16;
    throw Error("Unsupported accessor type: " + type);
}

void require_accessor(const Model& model, int accessor_index) {
    if (accessor_index < 0 || static_cast<size_t>(accessor_index) >= model.accessors.size()) {
        throw Error("Accessor index out of range: " + std::to_string(accessor_index));
    }
}

const BufferView& accessor_view(const Model& model, const Accessor& accessor) {
    if (accessor.buffer_view < 0 || static_cast<size_t>(accessor.buffer_view) >= model.buffer_views.size()) {
        throw Error("Accessor has no valid bufferView");
    }
    const BufferView& view = model.buffer_views[static_cast<size_t>(accessor.buffer_view)];
    if (view.buffer != 0) {
        throw Error("Only embedded GLB buffer 0 is supported");
    }
    return view;
}

double normalize_signed(int64_t value, int bits) {
    const double max_value = static_cast<double>((int64_t{1} << (bits - 1)) - 1);
    return std::max(-1.0, static_cast<double>(value) / max_value);
}

double normalize_unsigned(uint64_t value, int bits) {
    const double max_value = static_cast<double>((uint64_t{1} << bits) - 1);
    return static_cast<double>(value) / max_value;
}

double read_component(const std::vector<uint8_t>& bin, int component_type, bool normalized, size_t offset) {
    if (offset + component_size(component_type) > bin.size()) {
        throw Error("Accessor read exceeds BIN chunk");
    }
    switch (component_type) {
        case 5120: {
            const auto value = static_cast<int8_t>(bin[offset]);
            return normalized ? normalize_signed(value, 8) : static_cast<double>(value);
        }
        case 5121: {
            const auto value = static_cast<uint8_t>(bin[offset]);
            return normalized ? normalize_unsigned(value, 8) : static_cast<double>(value);
        }
        case 5122: {
            const int16_t value = static_cast<int16_t>(
                static_cast<uint16_t>(bin[offset]) | (static_cast<uint16_t>(bin[offset + 1]) << 8)
            );
            return normalized ? normalize_signed(value, 16) : static_cast<double>(value);
        }
        case 5123: {
            const uint16_t value = static_cast<uint16_t>(bin[offset]) | (static_cast<uint16_t>(bin[offset + 1]) << 8);
            return normalized ? normalize_unsigned(value, 16) : static_cast<double>(value);
        }
        case 5125: {
            const uint32_t value = static_cast<uint32_t>(bin[offset])
                | (static_cast<uint32_t>(bin[offset + 1]) << 8)
                | (static_cast<uint32_t>(bin[offset + 2]) << 16)
                | (static_cast<uint32_t>(bin[offset + 3]) << 24);
            return normalized ? normalize_unsigned(value, 32) : static_cast<double>(value);
        }
        case 5126: {
            uint32_t raw = static_cast<uint32_t>(bin[offset])
                | (static_cast<uint32_t>(bin[offset + 1]) << 8)
                | (static_cast<uint32_t>(bin[offset + 2]) << 16)
                | (static_cast<uint32_t>(bin[offset + 3]) << 24);
            float value = 0.0f;
            static_assert(sizeof(float) == sizeof(uint32_t), "Unexpected float size");
            std::memcpy(&value, &raw, sizeof(float));
            return static_cast<double>(value);
        }
        default:
            throw Error("Unsupported component type");
    }
}

} // namespace

void Bounds::include(const Vec3& value) {
    min.x = std::min(min.x, value.x);
    min.y = std::min(min.y, value.y);
    min.z = std::min(min.z, value.z);
    max.x = std::max(max.x, value.x);
    max.y = std::max(max.y, value.y);
    max.z = std::max(max.z, value.z);
    valid = true;
}

void Bounds::include(const Bounds& other) {
    if (!other.valid) {
        return;
    }
    include(other.min);
    include(other.max);
}

double Bounds::width_x() const {
    return valid ? max.x - min.x : 0.0;
}

double Bounds::height_y() const {
    return valid ? max.y - min.y : 0.0;
}

double Bounds::depth_z() const {
    return valid ? max.z - min.z : 0.0;
}

double Bounds::diameter_xz() const {
    return std::max(width_x(), depth_z());
}

double Bounds::volume() const {
    return width_x() * height_y() * depth_z();
}

std::vector<Vec2> read_vec2_accessor(const GlbData& glb, const Model& model, int accessor_index) {
    require_accessor(model, accessor_index);
    const Accessor& accessor = model.accessors[static_cast<size_t>(accessor_index)];
    if (accessor.type != "VEC2") {
        throw Error("Expected VEC2 accessor for UVs");
    }
    const BufferView& view = accessor_view(model, accessor);
    const size_t scalar_size = component_size(accessor.component_type);
    const size_t default_stride = scalar_size * component_count(accessor.type);
    const size_t stride = view.byte_stride ? view.byte_stride : default_stride;
    const size_t base = view.byte_offset + accessor.byte_offset;

    std::vector<Vec2> values;
    values.reserve(accessor.count);
    for (size_t i = 0; i < accessor.count; ++i) {
        const size_t item = base + i * stride;
        Vec2 uv;
        uv.u = read_component(glb.bin, accessor.component_type, accessor.normalized, item);
        uv.v = read_component(glb.bin, accessor.component_type, accessor.normalized, item + scalar_size);
        values.push_back(uv);
    }
    return values;
}

std::vector<Vec3> read_vec3_accessor(const GlbData& glb, const Model& model, int accessor_index) {
    require_accessor(model, accessor_index);
    const Accessor& accessor = model.accessors[static_cast<size_t>(accessor_index)];
    if (accessor.type != "VEC3") {
        throw Error("Expected VEC3 accessor for positions");
    }
    const BufferView& view = accessor_view(model, accessor);
    const size_t scalar_size = component_size(accessor.component_type);
    const size_t default_stride = scalar_size * component_count(accessor.type);
    const size_t stride = view.byte_stride ? view.byte_stride : default_stride;
    const size_t base = view.byte_offset + accessor.byte_offset;

    std::vector<Vec3> values;
    values.reserve(accessor.count);
    for (size_t i = 0; i < accessor.count; ++i) {
        const size_t item = base + i * stride;
        Vec3 value;
        value.x = read_component(glb.bin, accessor.component_type, accessor.normalized, item);
        value.y = read_component(glb.bin, accessor.component_type, accessor.normalized, item + scalar_size);
        value.z = read_component(glb.bin, accessor.component_type, accessor.normalized, item + scalar_size * 2);
        values.push_back(value);
    }
    return values;
}

std::vector<uint32_t> read_index_accessor(const GlbData& glb, const Model& model, int accessor_index) {
    require_accessor(model, accessor_index);
    const Accessor& accessor = model.accessors[static_cast<size_t>(accessor_index)];
    if (accessor.type != "SCALAR") {
        throw Error("Expected SCALAR accessor for indices");
    }
    const BufferView& view = accessor_view(model, accessor);
    const size_t scalar_size = component_size(accessor.component_type);
    const size_t stride = view.byte_stride ? view.byte_stride : scalar_size;
    const size_t base = view.byte_offset + accessor.byte_offset;

    std::vector<uint32_t> values;
    values.reserve(accessor.count);
    for (size_t i = 0; i < accessor.count; ++i) {
        const double value = read_component(glb.bin, accessor.component_type, false, base + i * stride);
        values.push_back(static_cast<uint32_t>(value));
    }
    return values;
}

std::vector<uint32_t> implicit_indices(size_t count) {
    std::vector<uint32_t> indices;
    indices.reserve(count);
    for (size_t i = 0; i < count; ++i) {
        indices.push_back(static_cast<uint32_t>(i));
    }
    return indices;
}

Bounds primitive_bounds(const GlbData& glb, const Model& model, const Primitive& primitive) {
    Bounds bounds;
    if (primitive.position_accessor < 0) {
        return bounds;
    }
    for (const Vec3& value : read_vec3_accessor(glb, model, primitive.position_accessor)) {
        bounds.include(value);
    }
    return bounds;
}

Bounds mesh_bounds(const GlbData& glb, const Model& model, const Mesh& mesh) {
    Bounds bounds;
    for (const Primitive& primitive : mesh.primitives) {
        bounds.include(primitive_bounds(glb, model, primitive));
    }
    return bounds;
}

std::vector<std::pair<std::string, Bounds>> collect_mesh_bounds(const GlbData& glb, const Model& model) {
    std::vector<std::pair<std::string, Bounds>> bounds;
    for (const Mesh& mesh : model.meshes) {
        bounds.push_back({mesh.name, mesh_bounds(glb, model, mesh)});
    }
    std::sort(bounds.begin(), bounds.end(), [](const auto& a, const auto& b) {
        return a.second.volume() > b.second.volume();
    });
    return bounds;
}

} // namespace glb_unwrapper
