#pragma once

#include <cstddef>
#include <map>
#include <string>
#include <vector>

namespace glb_unwrapper {

struct Json {
    enum class Type { Null, Bool, Number, String, Array, Object };

    Type type = Type::Null;
    bool bool_value = false;
    double number_value = 0.0;
    std::string string_value;
    std::vector<Json> array_value;
    std::map<std::string, Json> object_value;

    bool is_null() const;
    bool is_array() const;
    bool is_object() const;

    const Json& at(const std::string& key) const;
    const Json* find(const std::string& key) const;

    std::string as_string(const std::string& fallback = "") const;
    int as_int(int fallback = 0) const;
    size_t as_size(size_t fallback = 0) const;
    bool as_bool(bool fallback = false) const;
};

Json parse_json(std::string text);

} // namespace glb_unwrapper
