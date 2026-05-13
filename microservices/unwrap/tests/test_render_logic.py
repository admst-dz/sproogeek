import math
import unittest

from app.render import _decal_size_mm, _logo_xy_mm, _notebook_faces, _powerbank_faces, _thermos_faces
from app.schemas import LogoPlacement, NotebookDimensions, PowerbankDimensions, ThermosDimensions


class UnwrapRenderLogicTest(unittest.TestCase):
    def test_thermos_body_signed_origin_maps_to_center(self):
        face = _thermos_faces(ThermosDimensions())[0]
        logo = LogoPlacement(target="body", position=(0.0, 0.0), scale=0.6)

        x_mm, y_mm = _logo_xy_mm(face, logo)

        self.assertAlmostEqual(x_mm, face.width_mm / 2)
        self.assertAlmostEqual(y_mm, face.height_mm / 2)

    def test_thermos_body_uses_editor_ranges(self):
        face = _thermos_faces(ThermosDimensions())[0]
        lower_left = LogoPlacement(target="body", position=(-0.35, -2.5), scale=0.6)
        upper_right = LogoPlacement(target="body", position=(0.35, 2.5), scale=0.6)

        self.assertEqual(_logo_xy_mm(face, lower_left), (0.0, 0.0))
        self.assertAlmostEqual(_logo_xy_mm(face, upper_right)[0], face.width_mm)
        self.assertAlmostEqual(_logo_xy_mm(face, upper_right)[1], face.height_mm)

    def test_thermos_decal_size_is_based_on_diameter_not_unwrap_width(self):
        face = _thermos_faces(ThermosDimensions(body_diameter_mm=70.0))[0]
        logo = LogoPlacement(target="body", position=(0.0, 0.0), scale=0.6)

        width_mm, height_mm = _decal_size_mm(face, logo, None)

        self.assertAlmostEqual(width_mm, 42.0)
        self.assertAlmostEqual(height_mm, 42.0)
        self.assertLess(width_mm, math.pi * 70.0 * 0.25)

    def test_notebook_front_and_back_land_on_their_own_cover_panels(self):
        face = _notebook_faces(NotebookDimensions(width_mm=145.0, spine_thickness_mm=12.0))[0]
        back = LogoPlacement(target="back", side="back", position=(0.0, 0.0), scale=0.6)
        front = LogoPlacement(target="front", side="front", position=(0.0, 0.0), scale=0.6)

        self.assertAlmostEqual(_logo_xy_mm(face, back)[0], 72.5)
        self.assertAlmostEqual(_logo_xy_mm(face, front)[0], 229.5)

    def test_powerbank_outer_side_is_mirrored_like_the_3d_model(self):
        face = _powerbank_faces(PowerbankDimensions(width_mm=95.0, height_mm=65.0))[0]
        logo = LogoPlacement(target="outer", side="outer", position=(1.0, 0.0), scale=0.6)

        x_mm, y_mm = _logo_xy_mm(face, logo)

        self.assertAlmostEqual(x_mm, 0.0)
        self.assertAlmostEqual(y_mm, 32.5)


if __name__ == "__main__":
    unittest.main()
