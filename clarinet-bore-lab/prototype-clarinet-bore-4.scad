// OpenSCAD model generated from prototype-clarinet-bore-4.txt
// Units: millimeters

$fn = 120;

// ─── Dimensions ───────────────────────────────────────────────────────────────
body_length_mm    = 1291;
outer_diameter_mm = 24;
bore_diameter_mm  = 15.87;

// ─── Bend ─────────────────────────────────────────────────────────────────────
// 180° U-fold between Finger 4 and Finger 3.
// Bend radius is sized so the semicircular arc exactly fills that gap.
finger4_z = 577.0161338522802;
finger3_z = 691.1935085687628;
bend_r    = (finger3_z - finger4_z) / PI;   // ≈ 36.3 mm

lower_len = finger4_z;                        // arc-length of lower segment
upper_len = body_length_mm - finger3_z;       // arc-length of upper segment
upper_x   = -2 * bend_r;                      // X offset of upper cylinder axis

// ─── Hole data ────────────────────────────────────────────────────────────────
// s ≤ finger4_z  → lower straight segment
lower_holes = [
  [226.8669870587032,  7.5, "Finger 7"],
  [376.98842615369705, 5.5, "Finger 6"],
  [448.86064839718773, 7.0, "Finger 5"],
  [577.0161338522802,  7.0, "Finger 4"],
];

// s ≥ finger3_z  → upper straight segment
upper_holes = [
  [691.1935085687628, 7.0, "Finger 3"],
  [786.3749082290533, 7.0, "Finger 2"],
  [839.5580053756674, 7.0, "Finger 1"],
  [924.0,             7.0, "Thumb"],
];

hole_span = outer_diameter_mm + 20;

// Arc-length position on upper segment → world Z coordinate on the upper cylinder
function upper_z(s) = finger4_z - (s - finger3_z);

// ─── Geometry ─────────────────────────────────────────────────────────────────

// Lower vertical cylinder: bell end, runs 0 → finger4_z along Z at x=0
module lower_seg(d) {
  cylinder(h = lower_len, d = d);
}

// Half-torus connecting the top of both segments.
//   rotate([90,0,0]) tilts the torus from the XY plane into the XZ plane.
//   translate([-bend_r, 0, finger4_z]) places the two open ends at:
//     right → (0,        0, finger4_z)  tangent +Z  (meets lower cylinder)
//     left  → (upper_x,  0, finger4_z)  tangent −Z  (meets upper cylinder)
module half_torus(d) {
  translate([-bend_r, 0, finger4_z])
    rotate([90, 0, 0])
      rotate_extrude(angle = 180)
        translate([bend_r, 0])
          circle(d = d);
}

// Upper vertical cylinder: mouthpiece end, offset to x=upper_x, runs downward
module upper_seg(d) {
  translate([upper_x, 0, finger4_z - upper_len])
    cylinder(h = upper_len, d = d);
}

// Full path at diameter d (use for both outer body and bore)
module tube_path(d) {
  union() {
    lower_seg(d);
    half_torus(d);
    upper_seg(d);
  }
}

// ─── Hole cuts ────────────────────────────────────────────────────────────────

module cut_lower_holes() {
  for (h = lower_holes)
    translate([0, 0, h[0]])
      rotate([0, 90, 0])
        cylinder(h = hole_span, d = h[1], center = true);
}

module cut_upper_holes() {
  for (h = upper_holes)
    translate([upper_x, 0, upper_z(h[0])])
      rotate([0, 90, 0])
        cylinder(h = hole_span, d = h[1], center = true);
}

// ─── Labels ──────────────────────────────────────────────────────────────────
label_size  = 5;
label_depth = 1;

// Lower holes face outward in the +X direction.
module label_lower_holes() {
  for (h = lower_holes)
    translate([outer_diameter_mm / 2 + 0.5, 0, h[0]])
      rotate([90, 0, 0])
        linear_extrude(label_depth)
          text(h[2], size = label_size, halign = "left", valign = "bottom");
}

// Upper holes face outward in the −X direction (away from lower segment).
module label_upper_holes() {
  for (h = upper_holes)
    translate([upper_x - outer_diameter_mm / 2 - 0.5, 0, upper_z(h[0])])
      rotate([90, 0, 180])
        linear_extrude(label_depth)
          text(h[2], size = label_size, halign = "left", valign = "bottom");
}

// ─── Assembly ─────────────────────────────────────────────────────────────────
difference() {
  tube_path(outer_diameter_mm);
  tube_path(bore_diameter_mm);
  cut_lower_holes();
  cut_upper_holes();
}

color("White") {
  label_lower_holes();
  label_upper_holes();
}

// ─── Bell chamfer ─────────────────────────────────────────────────────────────
// 45° outward chamfer on the bell opening (z=0, lower cylinder).
bell_chamfer_h = 8;
color("FireBrick")
  translate([0, 0, -bell_chamfer_h])
    difference() {
      cylinder(h = bell_chamfer_h,
               d1 = outer_diameter_mm + 2 * bell_chamfer_h,
               d2 = outer_diameter_mm);
      translate([0, 0, -1])
        cylinder(h = bell_chamfer_h + 2, d = bore_diameter_mm);
    }
