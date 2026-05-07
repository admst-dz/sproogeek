#include <algorithm>
#include <array>
#include <cctype>
#include <cstring>
#include <cmath>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <map>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

struct Error : std::runtime_error {
    using std::runtime_error::runtime_error;
};

constexpr double PI = 3.14159265358979323846;

static uint32_t read_u32_le(const std::vector<uint8_t>& data, size_t offset) {
    if (offset + 4 > data.size()) {
        throw Error("Unexpected end of file while reading uint32");
    }
    return static_cast<uint32_t>(data[offset])
        | (static_cast<uint32_t>(data[offset + 1]) << 8)
        | (static_cast<uint32_t>(data[offset + 2]) << 16)
        | (static_cast<uint32_t>(data[offset + 3]) << 24);
}

static std::vector<uint8_t> read_file(const std::string& path) {
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

static void write_text_file(const std::string& path, const std::string& text) {
    std::ofstream file(path, std::ios::binary);
    if (!file) {
        throw Error("Could not open output file: " + path);
    }
    file.write(text.data(), static_cast<std::streamsize>(text.size()));
    if (!file) {
        throw Error("Could not write output file: " + path);
    }
}

struct Json {
    enum class Type { Null, Bool, Number, String, Array, Object };

    Type type = Type::Null;
    bool bool_value = false;
    double number_value = 0.0;
    std::string string_value;
    std::vector<Json> array_value;
    std::map<std::string, Json> object_value;

    bool is_null() const { return type == Type::Null; }
    bool is_array() const { return type == Type::Array; }
    bool is_object() const { return type == Type::Object; }

    const Json& at(const std::string& key) const {
        if (type != Type::Object) {
            throw Error("JSON value is not an object");
        }
        const auto it = object_value.find(key);
        if (it == object_value.end()) {
            throw Error("Missing JSON key: " + key);
        }
        return it->second;
    }

    const Json* find(const std::string& key) const {
        if (type != Type::Object) {
            return nullptr;
        }
        const auto it = object_value.find(key);
        return it == object_value.end() ? nullptr : &it->second;
    }

    std::string as_string(const std::string& fallback = "") const {
        return type == Type::String ? string_value : fallback;
    }

    int as_int(int fallback = 0) const {
        return type == Type::Number ? static_cast<int>(number_value) : fallback;
    }

    size_t as_size(size_t fallback = 0) const {
        return type == Type::Number && number_value >= 0 ? static_cast<size_t>(number_value) : fallback;
    }

    bool as_bool(bool fallback = false) const {
        return type == Type::Bool ? bool_value : fallback;
    }
};

class JsonParser {
public:
    explicit JsonParser(std::string text) : text_(std::move(text)) {}

    Json parse() {
        skip_ws();
        return parse_value();
    }

private:
    std::string text_;
    size_t pos_ = 0;

    void skip_ws() {
        while (pos_ < text_.size()) {
            const unsigned char c = static_cast<unsigned char>(text_[pos_]);
            if (!std::isspace(c)) {
                break;
            }
            ++pos_;
        }
    }

    char peek() const {
        return pos_ < text_.size() ? text_[pos_] : '\0';
    }

    char get() {
        if (pos_ >= text_.size()) {
            throw Error("Unexpected end of JSON");
        }
        return text_[pos_++];
    }

    void expect(char expected) {
        const char actual = get();
        if (actual != expected) {
            std::ostringstream out;
            out << "Expected '" << expected << "', got '" << actual << "'";
            throw Error(out.str());
        }
    }

    bool consume(const std::string& value) {
        if (text_.compare(pos_, value.size(), value) == 0) {
            pos_ += value.size();
            return true;
        }
        return false;
    }

    Json parse_value() {
        skip_ws();
        const char c = peek();
        if (c == '{') return parse_object();
        if (c == '[') return parse_array();
        if (c == '"') return parse_string();
        if (c == '-' || std::isdigit(static_cast<unsigned char>(c))) return parse_number();
        if (consume("true")) {
            Json value;
            value.type = Json::Type::Bool;
            value.bool_value = true;
            return value;
        }
        if (consume("false")) {
            Json value;
            value.type = Json::Type::Bool;
            value.bool_value = false;
            return value;
        }
        if (consume("null")) {
            return Json{};
        }
        throw Error("Invalid JSON value");
    }

    Json parse_object() {
        Json value;
        value.type = Json::Type::Object;
        expect('{');
        skip_ws();
        if (peek() == '}') {
            get();
            return value;
        }
        while (true) {
            skip_ws();
            Json key = parse_string();
            skip_ws();
            expect(':');
            Json child = parse_value();
            value.object_value.emplace(std::move(key.string_value), std::move(child));
            skip_ws();
            const char c = get();
            if (c == '}') {
                break;
            }
            if (c != ',') {
                throw Error("Expected ',' or '}' in JSON object");
            }
        }
        return value;
    }

    Json parse_array() {
        Json value;
        value.type = Json::Type::Array;
        expect('[');
        skip_ws();
        if (peek() == ']') {
            get();
            return value;
        }
        while (true) {
            value.array_value.push_back(parse_value());
            skip_ws();
            const char c = get();
            if (c == ']') {
                break;
            }
            if (c != ',') {
                throw Error("Expected ',' or ']' in JSON array");
            }
        }
        return value;
    }

    Json parse_string() {
        Json value;
        value.type = Json::Type::String;
        expect('"');
        while (true) {
            const char c = get();
            if (c == '"') {
                break;
            }
            if (c == '\\') {
                const char escaped = get();
                switch (escaped) {
                    case '"': value.string_value.push_back('"'); break;
                    case '\\': value.string_value.push_back('\\'); break;
                    case '/': value.string_value.push_back('/'); break;
                    case 'b': value.string_value.push_back('\b'); break;
                    case 'f': value.string_value.push_back('\f'); break;
                    case 'n': value.string_value.push_back('\n'); break;
                    case 'r': value.string_value.push_back('\r'); break;
                    case 't': value.string_value.push_back('\t'); break;
                    case 'u':
                        for (int i = 0; i < 4; ++i) {
                            (void)get();
                        }
                        value.string_value.push_back('?');
                        break;
                    default:
                        throw Error("Invalid JSON string escape");
                }
            } else {
                value.string_value.push_back(c);
            }
        }
        return value;
    }

    Json parse_number() {
        const size_t start = pos_;
        if (peek() == '-') {
            ++pos_;
        }
        while (std::isdigit(static_cast<unsigned char>(peek()))) {
            ++pos_;
        }
        if (peek() == '.') {
            ++pos_;
            while (std::isdigit(static_cast<unsigned char>(peek()))) {
                ++pos_;
            }
        }
        if (peek() == 'e' || peek() == 'E') {
            ++pos_;
            if (peek() == '+' || peek() == '-') {
                ++pos_;
            }
            while (std::isdigit(static_cast<unsigned char>(peek()))) {
                ++pos_;
            }
        }
        Json value;
        value.type = Json::Type::Number;
        value.number_value = std::stod(text_.substr(start, pos_ - start));
        return value;
    }
};

struct GlbData {
    Json root;
    std::vector<uint8_t> bin;
};

static GlbData load_glb(const std::string& path) {
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
    data.root = JsonParser(std::move(json_text)).parse();
    data.bin = std::move(bin);
    return data;
}

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

static const Json& array_at(const Json& root, const std::string& key) {
    const Json* value = root.find(key);
    if (!value || !value->is_array()) {
        throw Error("Missing glTF array: " + key);
    }
    return *value;
}

static int attribute_accessor(const Json& attributes, const std::string& key) {
    const Json* value = attributes.find(key);
    return value ? value->as_int(-1) : -1;
}

static Model parse_model(const Json& root) {
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

static size_t component_size(int component_type) {
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

static size_t component_count(const std::string& type) {
    if (type == "SCALAR") return 1;
    if (type == "VEC2") return 2;
    if (type == "VEC3") return 3;
    if (type == "VEC4") return 4;
    if (type == "MAT2") return 4;
    if (type == "MAT3") return 9;
    if (type == "MAT4") return 16;
    throw Error("Unsupported accessor type: " + type);
}

static void require_accessor(const Model& model, int accessor_index) {
    if (accessor_index < 0 || static_cast<size_t>(accessor_index) >= model.accessors.size()) {
        throw Error("Accessor index out of range: " + std::to_string(accessor_index));
    }
}

static const BufferView& accessor_view(const Model& model, const Accessor& accessor) {
    if (accessor.buffer_view < 0 || static_cast<size_t>(accessor.buffer_view) >= model.buffer_views.size()) {
        throw Error("Accessor has no valid bufferView");
    }
    const BufferView& view = model.buffer_views[static_cast<size_t>(accessor.buffer_view)];
    if (view.buffer != 0) {
        throw Error("Only embedded GLB buffer 0 is supported");
    }
    return view;
}

static double normalize_signed(int64_t value, int bits) {
    const double max_value = static_cast<double>((int64_t{1} << (bits - 1)) - 1);
    return std::max(-1.0, static_cast<double>(value) / max_value);
}

static double normalize_unsigned(uint64_t value, int bits) {
    const double max_value = static_cast<double>((uint64_t{1} << bits) - 1);
    return static_cast<double>(value) / max_value;
}

static double read_component(const std::vector<uint8_t>& bin, int component_type, bool normalized, size_t offset) {
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

    void include(const Vec3& value) {
        min.x = std::min(min.x, value.x);
        min.y = std::min(min.y, value.y);
        min.z = std::min(min.z, value.z);
        max.x = std::max(max.x, value.x);
        max.y = std::max(max.y, value.y);
        max.z = std::max(max.z, value.z);
        valid = true;
    }

    void include(const Bounds& other) {
        if (!other.valid) {
            return;
        }
        include(other.min);
        include(other.max);
    }

    double width_x() const { return valid ? max.x - min.x : 0.0; }
    double height_y() const { return valid ? max.y - min.y : 0.0; }
    double depth_z() const { return valid ? max.z - min.z : 0.0; }
    double diameter_xz() const { return std::max(width_x(), depth_z()); }
    double volume() const { return width_x() * height_y() * depth_z(); }
};

static std::vector<Vec2> read_vec2_accessor(const GlbData& glb, const Model& model, int accessor_index) {
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

static std::vector<Vec3> read_vec3_accessor(const GlbData& glb, const Model& model, int accessor_index) {
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

static std::vector<uint32_t> read_index_accessor(const GlbData& glb, const Model& model, int accessor_index) {
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

static std::vector<uint32_t> implicit_indices(size_t count) {
    std::vector<uint32_t> indices;
    indices.reserve(count);
    for (size_t i = 0; i < count; ++i) {
        indices.push_back(static_cast<uint32_t>(i));
    }
    return indices;
}

static std::string xml_escape(const std::string& value) {
    std::string out;
    for (char c : value) {
        switch (c) {
            case '&': out += "&amp;"; break;
            case '<': out += "&lt;"; break;
            case '>': out += "&gt;"; break;
            case '"': out += "&quot;"; break;
            case '\'': out += "&apos;"; break;
            default: out.push_back(c); break;
        }
    }
    return out;
}

static std::string json_escape(const std::string& value) {
    std::string out;
    for (char c : value) {
        switch (c) {
            case '\\': out += "\\\\"; break;
            case '"': out += "\\\""; break;
            case '\b': out += "\\b"; break;
            case '\f': out += "\\f"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default: out.push_back(c); break;
        }
    }
    return out;
}

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

static bool mesh_matches(const Mesh& mesh, size_t index, const std::string& filter) {
    if (filter.empty()) {
        return true;
    }
    if (mesh.name == filter) {
        return true;
    }
    try {
        return static_cast<size_t>(std::stoul(filter)) == index;
    } catch (...) {
        return false;
    }
}

static std::string format_number(double value) {
    std::ostringstream out;
    out << std::fixed << std::setprecision(3) << value;
    return out.str();
}

static Bounds primitive_bounds(const GlbData& glb, const Model& model, const Primitive& primitive) {
    Bounds bounds;
    if (primitive.position_accessor < 0) {
        return bounds;
    }
    for (const Vec3& value : read_vec3_accessor(glb, model, primitive.position_accessor)) {
        bounds.include(value);
    }
    return bounds;
}

static Bounds mesh_bounds(const GlbData& glb, const Model& model, const Mesh& mesh) {
    Bounds bounds;
    for (const Primitive& primitive : mesh.primitives) {
        bounds.include(primitive_bounds(glb, model, primitive));
    }
    return bounds;
}

static std::string export_uv_svg(const GlbData& glb, const Model& model, const ExportOptions& options) {
    const double usable_width = std::max(1, options.width - 2 * options.margin);
    const double usable_height = std::max(1, options.height - 2 * options.margin);
    size_t triangle_count = 0;

    std::ostringstream svg;
    svg << "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n";
    svg << "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"" << options.width
        << "px\" height=\"" << options.height << "px\" viewBox=\"0 0 "
        << options.width << " " << options.height << "\">\n";
    svg << "  <metadata>Generated by glb_unwrapper. UV coordinates are normalized glTF TEXCOORD_0 space.</metadata>\n";
    svg << "  <rect x=\"0\" y=\"0\" width=\"" << options.width << "\" height=\""
        << options.height << "\" fill=\"white\"/>\n";

    for (size_t mesh_index = 0; mesh_index < model.meshes.size(); ++mesh_index) {
        const Mesh& mesh = model.meshes[mesh_index];
        if (!mesh_matches(mesh, mesh_index, options.mesh_filter)) {
            continue;
        }

        svg << "  <g id=\"mesh-" << mesh_index << "\" data-name=\"" << xml_escape(mesh.name) << "\">\n";
        for (size_t primitive_index = 0; primitive_index < mesh.primitives.size(); ++primitive_index) {
            if (options.primitive_filter >= 0 && options.primitive_filter != static_cast<int>(primitive_index)) {
                continue;
            }
            const Primitive& primitive = mesh.primitives[primitive_index];
            if (primitive.uv_accessor < 0) {
                svg << "    <!-- primitive " << primitive_index << " skipped: no TEXCOORD_0 -->\n";
                continue;
            }
            if (primitive.mode != 4) {
                svg << "    <!-- primitive " << primitive_index << " skipped: only TRIANGLES mode is supported -->\n";
                continue;
            }

            const auto uvs = read_vec2_accessor(glb, model, primitive.uv_accessor);
            std::vector<uint32_t> indices;
            if (primitive.index_accessor >= 0) {
                indices = read_index_accessor(glb, model, primitive.index_accessor);
            } else {
                indices = implicit_indices(uvs.size());
            }

            svg << "    <g id=\"mesh-" << mesh_index << "-primitive-" << primitive_index << "\"";
            svg << " fill=\"" << xml_escape(options.fill) << "\" stroke=\"" << xml_escape(options.stroke)
                << "\" stroke-width=\"1\" vector-effect=\"non-scaling-stroke\">\n";

            for (size_t i = 0; i + 2 < indices.size(); i += 3) {
                const uint32_t a = indices[i];
                const uint32_t b = indices[i + 1];
                const uint32_t c = indices[i + 2];
                if (a >= uvs.size() || b >= uvs.size() || c >= uvs.size()) {
                    continue;
                }
                const Vec2 tri[3] = {uvs[a], uvs[b], uvs[c]};
                svg << "      <polygon points=\"";
                for (const Vec2& uv : tri) {
                    const double x = options.margin + uv.u * usable_width;
                    const double v = options.flip_v ? (1.0 - uv.v) : uv.v;
                    const double y = options.margin + v * usable_height;
                    svg << format_number(x) << "," << format_number(y) << " ";
                }
                svg << "\"/>\n";
                ++triangle_count;
            }

            svg << "    </g>\n";
        }
        svg << "  </g>\n";
    }

    svg << "  <metadata>triangles=" << triangle_count << "</metadata>\n";
    svg << "</svg>\n";
    return svg.str();
}

struct PrintKitOptions {
    std::string product = "thermos";
    double body_diameter_mm = 70.0;
    double body_height_mm = 190.0;
    double cap_diameter_mm = 55.0;
    double cap_side_height_mm = 35.0;
    double bleed_mm = 3.0;
    double safe_mm = 3.0;
    double page_margin_mm = 12.0;
    double gap_mm = 16.0;
    double label_height_mm = 10.0;
    bool body_diameter_set = false;
    bool body_height_set = false;
    bool cap_diameter_set = false;
    bool cap_side_height_set = false;
};

struct TemplatePart {
    std::string id;
    std::string title;
    std::string kind;
    double x = 0.0;
    double y = 0.0;
    double width = 0.0;
    double height = 0.0;
    double radius = 0.0;
};

static bool print_kit_is_calibrated(const PrintKitOptions& options) {
    return options.body_diameter_set
        && options.body_height_set
        && options.cap_diameter_set
        && options.cap_side_height_set;
}

static double circumference(double diameter) {
    return PI * diameter;
}

static std::string style_text() {
    return R"(  <style>
    .label { font: 4px Arial, sans-serif; fill: #222; }
    .small { font: 3px Arial, sans-serif; fill: #555; }
    .cut { fill: none; stroke: #ff00ff; stroke-width: 0.15; }
    .bleed { fill: #ff00ff; fill-opacity: 0.035; stroke: #ff00ff; stroke-width: 0.12; stroke-dasharray: 1.5 1.2; }
    .safe { fill: none; stroke: #0085ff; stroke-width: 0.12; stroke-dasharray: 1.2 1.2; }
    .artwork { fill: #000000; fill-opacity: 0.018; stroke: #999; stroke-width: 0.08; }
    .mark { fill: none; stroke: #000; stroke-width: 0.12; }
  </style>
)";
}

static void svg_rect(std::ostringstream& svg, const std::string& klass, double x, double y, double w, double h) {
    svg << "    <rect class=\"" << klass << "\" x=\"" << format_number(x) << "\" y=\"" << format_number(y)
        << "\" width=\"" << format_number(w) << "\" height=\"" << format_number(h) << "\"/>\n";
}

static void svg_circle(std::ostringstream& svg, const std::string& klass, double cx, double cy, double r) {
    svg << "    <circle class=\"" << klass << "\" cx=\"" << format_number(cx) << "\" cy=\"" << format_number(cy)
        << "\" r=\"" << format_number(r) << "\"/>\n";
}

static void svg_label(std::ostringstream& svg, const std::string& klass, double x, double y, const std::string& text) {
    svg << "    <text class=\"" << klass << "\" x=\"" << format_number(x) << "\" y=\"" << format_number(y)
        << "\">" << xml_escape(text) << "</text>\n";
}

static void registration_mark(std::ostringstream& svg, double x, double y, double size) {
    const double r = size * 0.42;
    svg << "    <g class=\"mark\">\n";
    svg << "      <circle cx=\"" << format_number(x) << "\" cy=\"" << format_number(y) << "\" r=\"" << format_number(r) << "\"/>\n";
    svg << "      <path d=\"M " << format_number(x - size) << " " << format_number(y)
        << " L " << format_number(x + size) << " " << format_number(y) << "\"/>\n";
    svg << "      <path d=\"M " << format_number(x) << " " << format_number(y - size)
        << " L " << format_number(x) << " " << format_number(y + size) << "\"/>\n";
    svg << "    </g>\n";
}

static std::vector<std::pair<std::string, Bounds>> collect_mesh_bounds(const GlbData& glb, const Model& model) {
    std::vector<std::pair<std::string, Bounds>> bounds;
    for (const Mesh& mesh : model.meshes) {
        bounds.push_back({mesh.name, mesh_bounds(glb, model, mesh)});
    }
    std::sort(bounds.begin(), bounds.end(), [](const auto& a, const auto& b) {
        return a.second.volume() > b.second.volume();
    });
    return bounds;
}

static std::string export_print_template_svg(const PrintKitOptions& options) {
    const double body_width = circumference(options.body_diameter_mm);
    const double cap_side_width = circumference(options.cap_diameter_mm);
    const double cap_top_size = options.cap_diameter_mm;
    const double bleed = options.bleed_mm;
    const double safe = options.safe_mm;
    const double x = options.page_margin_mm + bleed;
    double y = options.page_margin_mm + options.label_height_mm + bleed;

    std::vector<TemplatePart> parts;
    parts.push_back({"ARTWORK_BODY_WRAP", "Корпус термоса / BODY WRAP", "wrap-rectangle", x, y, body_width, options.body_height_mm, 0.0});
    y += options.body_height_mm + 2 * bleed + options.gap_mm + options.label_height_mm;
    parts.push_back({"ARTWORK_CAP_SIDE_WRAP", "Бок крышки / CAP SIDE WRAP", "wrap-rectangle", x, y, cap_side_width, options.cap_side_height_mm, 0.0});
    y += options.cap_side_height_mm + 2 * bleed + options.gap_mm + options.label_height_mm;
    parts.push_back({"ARTWORK_CAP_TOP", "Верх крышки / CAP TOP", "circle", x, y, cap_top_size, cap_top_size, cap_top_size / 2.0});

    double content_width = 0.0;
    for (const TemplatePart& part : parts) {
        content_width = std::max(content_width, part.kind == "circle" ? part.radius * 2.0 : part.width);
    }
    const double page_width = content_width + 2 * options.page_margin_mm + 2 * bleed;
    const double page_height = y + cap_top_size + options.page_margin_mm + bleed;

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
    svg_label(svg, "label", options.page_margin_mm, 7.0, "SPRUZHYK THERMOS PRINT TEMPLATE");
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

static std::string export_print_spec_json(
    const std::string& input,
    const GlbData& glb,
    const Model& model,
    const PrintKitOptions& options
) {
    const auto bounds = collect_mesh_bounds(glb, model);
    std::ostringstream json;
    json << "{\n";
    json << "  \"source_glb\": \"" << json_escape(input) << "\",\n";
    json << "  \"product\": \"" << json_escape(options.product) << "\",\n";
    json << "  \"units\": \"mm\",\n";
    json << "  \"calibrated_for_production\": " << (print_kit_is_calibrated(options) ? "true" : "false") << ",\n";
    json << "  \"prepress\": {\n";
    json << "    \"color_note\": \"SVG is RGB technical template; convert artwork to CMYK/Pantone in prepress software before final PDF/X export.\",\n";
    json << "    \"cut_contour\": \"magenta #ff00ff strokes in CUT_CONTOUR layer\",\n";
    json << "    \"bleed_mm\": " << format_number(options.bleed_mm) << ",\n";
    json << "    \"safe_area_mm\": " << format_number(options.safe_mm) << ",\n";
    json << "    \"min_line_mm\": 0.2,\n";
    json << "    \"recommended_raster_dpi\": 300\n";
    json << "  },\n";
    json << "  \"parts\": [\n";
    json << "    {\"id\":\"body_wrap\",\"type\":\"rectangle\",\"width_mm\":" << format_number(circumference(options.body_diameter_mm))
        << ",\"height_mm\":" << format_number(options.body_height_mm)
        << ",\"diameter_mm\":" << format_number(options.body_diameter_mm) << "},\n";
    json << "    {\"id\":\"cap_side_wrap\",\"type\":\"rectangle\",\"width_mm\":" << format_number(circumference(options.cap_diameter_mm))
        << ",\"height_mm\":" << format_number(options.cap_side_height_mm)
        << ",\"diameter_mm\":" << format_number(options.cap_diameter_mm) << "},\n";
    json << "    {\"id\":\"cap_top\",\"type\":\"circle\",\"diameter_mm\":" << format_number(options.cap_diameter_mm) << "}\n";
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
    json << "  ]\n";
    json << "}\n";
    return json.str();
}

static std::string export_print_readme(const PrintKitOptions& options) {
    std::ostringstream out;
    out << "Spruzhyk thermos print kit\n\n";
    out << "Files:\n";
    out << "- print-template.svg: millimeter template with body, cap side and cap top print zones.\n";
    out << "- print-spec.json: machine-readable dimensions and prepress notes.\n\n";
    out << "Layer guide:\n";
    out << "- ARTWORK_BODY_WRAP: put thermos body artwork inside this rectangle.\n";
    out << "- ARTWORK_CAP_SIDE_WRAP: put cap side artwork inside this strip.\n";
    out << "- ARTWORK_CAP_TOP: put cap top artwork inside this circle.\n";
    out << "- WHITE_UNDERBASE: optional white base for dark/colored materials.\n";
    out << "- VARNISH_OR_SPECIAL_FINISH: optional mask for varnish, foil or spot effects.\n";
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

static void print_inspect(const GlbData& glb, const Model& model) {
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

static void usage() {
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
        << "  --body-diameter-mm <mm>    Physical thermos body diameter\n"
        << "  --body-height-mm <mm>      Printable body height\n"
        << "  --cap-diameter-mm <mm>     Physical cap diameter\n"
        << "  --cap-side-height-mm <mm>  Printable cap side height\n"
        << "  --bleed-mm <mm>            Bleed around trim, default 3\n"
        << "  --safe-mm <mm>             Safe area inset, default 3\n"
        << "  --page-margin-mm <mm>      Page margin, default 12\n"
        << "  --gap-mm <mm>              Gap between parts, default 16\n";
}

static int parse_int_arg(const std::string& flag, const std::string& value) {
    try {
        return std::stoi(value);
    } catch (...) {
        throw Error("Invalid integer for " + flag + ": " + value);
    }
}

static double parse_double_arg(const std::string& flag, const std::string& value) {
    try {
        return std::stod(value);
    } catch (...) {
        throw Error("Invalid number for " + flag + ": " + value);
    }
}

static ExportOptions parse_export_options(int argc, char** argv, int start) {
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

static PrintKitOptions parse_print_kit_options(int argc, char** argv, int start) {
    PrintKitOptions options;
    for (int i = start; i < argc; ++i) {
        const std::string arg = argv[i];
        auto require_value = [&](const std::string& flag) -> std::string {
            if (i + 1 >= argc) {
                throw Error("Missing value for " + flag);
            }
            return argv[++i];
        };

        if (arg == "--body-diameter-mm") {
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

    if (options.body_diameter_mm <= 0 || options.body_height_mm <= 0
        || options.cap_diameter_mm <= 0 || options.cap_side_height_mm <= 0) {
        throw Error("Print dimensions must be positive");
    }
    if (options.bleed_mm < 0 || options.safe_mm < 0 || options.page_margin_mm < 0 || options.gap_mm < 0) {
        throw Error("Print margins must not be negative");
    }
    return options;
}

static void export_print_kit(
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

} // namespace

int main(int argc, char** argv) {
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
