#include "glb_reader.hpp"

#include "error.hpp"

#include <fstream>
#include <sstream>
#include <utility>

namespace glb_unwrapper {
namespace {

uint32_t read_u32_le(const std::vector<uint8_t>& data, size_t offset) {
    if (offset + 4 > data.size()) {
        throw Error("Unexpected end of file while reading uint32");
    }
    return static_cast<uint32_t>(data[offset])
        | (static_cast<uint32_t>(data[offset + 1]) << 8)
        | (static_cast<uint32_t>(data[offset + 2]) << 16)
        | (static_cast<uint32_t>(data[offset + 3]) << 24);
}

std::vector<uint8_t> read_file(const std::string& path) {
    std::ifstream file(path, std::ios::binary);
    if (!file) {
        throw Error("Could not open file: " + path);
    }
    file.seekg(0, std::ios::end);
    const auto size = file.tellg();
    if (size < 0) {
        throw Error("Could not determine file size: " + path);
    }
    file.seekg(0, std::ios::beg);
    std::vector<uint8_t> data(static_cast<size_t>(size));
    if (!data.empty()) {
        file.read(reinterpret_cast<char*>(data.data()), static_cast<std::streamsize>(data.size()));
    }
    if (!file && !data.empty()) {
        throw Error("Could not read full file: " + path);
    }
    return data;
}

const Json& array_at(const Json& root, const std::string& key) {
    const Json* value = root.find(key);
    if (!value || !value->is_array()) {
        throw Error("Missing glTF array: " + key);
    }
    return *value;
}

int attribute_accessor(const Json& attributes, const std::string& key) {
    const Json* value = attributes.find(key);
    return value ? value->as_int(-1) : -1;
}

} // namespace

void write_text_file(const std::string& path, const std::string& text) {
    std::ofstream file(path, std::ios::binary);
    if (!file) {
        throw Error("Could not open output file: " + path);
    }
    file.write(text.data(), static_cast<std::streamsize>(text.size()));
    if (!file) {
        throw Error("Could not write output file: " + path);
    }
}

GlbData load_glb(const std::string& path) {
    constexpr uint32_t GLB_MAGIC = 0x46546C67;
    constexpr uint32_t JSON_CHUNK = 0x4E4F534A;
    constexpr uint32_t BIN_CHUNK = 0x004E4942;

    const auto file = read_file(path);
    if (file.size() < 12) {
        throw Error("File is too small to be a GLB");
    }
    if (read_u32_le(file, 0) != GLB_MAGIC) {
        throw Error("File is not a GLB: invalid magic");
    }
    const uint32_t version = read_u32_le(file, 4);
    if (version != 2) {
        throw Error("Only GLB 2.0 is supported");
    }
    const uint32_t declared_length = read_u32_le(file, 8);
    if (declared_length > file.size()) {
        throw Error("GLB declared length exceeds file size");
    }

    std::string json_text;
    std::vector<uint8_t> bin;
    size_t offset = 12;
    while (offset + 8 <= declared_length) {
        const uint32_t chunk_length = read_u32_le(file, offset);
        const uint32_t chunk_type = read_u32_le(file, offset + 4);
        offset += 8;
        if (offset + chunk_length > declared_length) {
            throw Error("GLB chunk exceeds declared file length");
        }
        if (chunk_type == JSON_CHUNK) {
            json_text.assign(
                reinterpret_cast<const char*>(file.data() + offset),
                reinterpret_cast<const char*>(file.data() + offset + chunk_length)
            );
        } else if (chunk_type == BIN_CHUNK) {
            bin.assign(file.begin() + static_cast<std::ptrdiff_t>(offset),
                       file.begin() + static_cast<std::ptrdiff_t>(offset + chunk_length));
        }
        offset += chunk_length;
    }
    if (json_text.empty()) {
        throw Error("GLB does not contain a JSON chunk");
    }

    GlbData data;
    data.root = parse_json(std::move(json_text));
    data.bin = std::move(bin);
    return data;
}

Model parse_model(const Json& root) {
    Model model;

    if (const Json* views = root.find("bufferViews")) {
        if (!views->is_array()) {
            throw Error("bufferViews must be an array");
        }
        for (const Json& item : views->array_value) {
            BufferView view;
            view.buffer = item.find("buffer") ? item.at("buffer").as_int(0) : 0;
            view.byte_offset = item.find("byteOffset") ? item.at("byteOffset").as_size(0) : 0;
            view.byte_length = item.find("byteLength") ? item.at("byteLength").as_size(0) : 0;
            view.byte_stride = item.find("byteStride") ? item.at("byteStride").as_size(0) : 0;
            model.buffer_views.push_back(view);
        }
    }

    for (const Json& item : array_at(root, "accessors").array_value) {
        Accessor accessor;
        accessor.buffer_view = item.find("bufferView") ? item.at("bufferView").as_int(-1) : -1;
        accessor.byte_offset = item.find("byteOffset") ? item.at("byteOffset").as_size(0) : 0;
        accessor.component_type = item.find("componentType") ? item.at("componentType").as_int(0) : 0;
        accessor.count = item.find("count") ? item.at("count").as_size(0) : 0;
        accessor.type = item.find("type") ? item.at("type").as_string() : "";
        accessor.normalized = item.find("normalized") ? item.at("normalized").as_bool(false) : false;
        model.accessors.push_back(accessor);
    }

    const Json& meshes = array_at(root, "meshes");
    for (size_t mesh_index = 0; mesh_index < meshes.array_value.size(); ++mesh_index) {
        const Json& mesh_json = meshes.array_value[mesh_index];
        Mesh mesh;
        mesh.name = mesh_json.find("name") ? mesh_json.at("name").as_string() : ("mesh_" + std::to_string(mesh_index));
        const Json* primitives = mesh_json.find("primitives");
        if (!primitives || !primitives->is_array()) {
            continue;
        }
        for (const Json& primitive_json : primitives->array_value) {
            Primitive primitive;
            primitive.mode = primitive_json.find("mode") ? primitive_json.at("mode").as_int(4) : 4;
            primitive.index_accessor = primitive_json.find("indices") ? primitive_json.at("indices").as_int(-1) : -1;
            primitive.material = primitive_json.find("material") ? primitive_json.at("material").as_int(-1) : -1;
            if (const Json* attributes = primitive_json.find("attributes")) {
                primitive.position_accessor = attribute_accessor(*attributes, "POSITION");
                primitive.uv_accessor = attribute_accessor(*attributes, "TEXCOORD_0");
                primitive.normal_accessor = attribute_accessor(*attributes, "NORMAL");
            }
            mesh.primitives.push_back(primitive);
        }
        model.meshes.push_back(std::move(mesh));
    }

    return model;
}

} // namespace glb_unwrapper
