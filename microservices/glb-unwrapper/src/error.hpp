#pragma once

#include <stdexcept>

namespace glb_unwrapper {

struct Error : std::runtime_error {
    using std::runtime_error::runtime_error;
};

} // namespace glb_unwrapper
