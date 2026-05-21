#include "json.hpp"

#include "error.hpp"

#include <cctype>
#include <sstream>
#include <utility>

namespace glb_unwrapper {

bool Json::is_null() const {
    return type == Type::Null;
}

bool Json::is_array() const {
    return type == Type::Array;
}

bool Json::is_object() const {
    return type == Type::Object;
}

const Json& Json::at(const std::string& key) const {
    if (type != Type::Object) {
        throw Error("JSON value is not an object");
    }
    const auto it = object_value.find(key);
    if (it == object_value.end()) {
        throw Error("Missing JSON key: " + key);
    }
    return it->second;
}

const Json* Json::find(const std::string& key) const {
    if (type != Type::Object) {
        return nullptr;
    }
    const auto it = object_value.find(key);
    return it == object_value.end() ? nullptr : &it->second;
}

std::string Json::as_string(const std::string& fallback) const {
    return type == Type::String ? string_value : fallback;
}

int Json::as_int(int fallback) const {
    return type == Type::Number ? static_cast<int>(number_value) : fallback;
}

size_t Json::as_size(size_t fallback) const {
    return type == Type::Number && number_value >= 0 ? static_cast<size_t>(number_value) : fallback;
}

bool Json::as_bool(bool fallback) const {
    return type == Type::Bool ? bool_value : fallback;
}

namespace {

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

} // namespace

Json parse_json(std::string text) {
    return JsonParser(std::move(text)).parse();
}

} // namespace glb_unwrapper
