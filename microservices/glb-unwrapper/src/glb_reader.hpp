#pragma once

#include "json.hpp"

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace glb_unwrapper {

struct GlbData {
    Json root;
    std::vector<uint8_t> bin;
};

struct BufferView {
    int buffer = 0;
    size_t byte_offset = 0;
    size_t byte_length = 0;
    size_t byte_stride = 0;
};

struct Accessor {
    int buffer_view = -1;
    size_t byte_offset = 0;
    int component_type = 0;
    size_t count = 0;
    std::string type;
    bool normalized = false;
};

struct Primitive {
    int mode = 4;
    int position_accessor = -1;
    int uv_accessor = -1;
    int normal_accessor = -1;
    int index_accessor = -1;
    int material = -1;
};

struct Mesh {
    std::string name;
    std::vector<Primitive> primitives;
};

struct Model {
    std::vector<BufferView> buffer_views;
    std::vector<Accessor> accessors;
    std::vector<Mesh> meshes;
};

GlbData load_glb(const std::string& path);
Model parse_model(const Json& root);
void write_text_file(const std::string& path, const std::string& text);

} // namespace glb_unwrapper
