#pragma once

#include <string>

namespace glb_unwrapper {

std::string xml_escape(const std::string& value);
std::string json_escape(const std::string& value);
std::string format_number(double value);

} // namespace glb_unwrapper
