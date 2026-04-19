// OpenSCAD model generated from prototype-clarinet-bore-4.txt
// Units: millimeters

$fn = 120;

// ─── Dimensions ───────────────────────────────────────────────────────────────
body_length_mm    = 1291;
outer_diameter_mm = 24;
bore_diameter_mm  = 15.87;
mouthpiece_tail_len_mm = 250;
mouthpiece_tail_od_mm  = 16.11;

// ─── Bend ─────────────────────────────────────────────────────────────────────
// 180° U-fold between Finger 4 and Finger 3.
// Bend radius is sized so the semicircular arc exactly fills that gap.
finger4_z = 577.0161338522802;
finger3_z = 691.1935085687628;
bend_r    = (finger3_z - finger4_z) / PI;   // ≈ 36.3 mm

lower_len = finger4_z;                        // arc-length of lower segment
upper_len = body_length_mm - finger3_z;       // arc-length of upper segment
upper_x   = -2 * bend_r;                      // X offset of upper cylinder axis
upper_tail_len = min(mouthpiece_tail_len_mm, upper_len);
upper_main_len = upper_len - upper_tail_len;

// ─── Hole data ────────────────────────────────────────────────────────────────
// s ≤ finger4_z  → lower straight segment
lower_holes = [
  [226.8669870587032,  7.5, "Finger 7", 0],
  [376.98842615369705, 5.5, "Finger 6", 0],
  [448.86064839718773, 7.0, "Finger 5", 0],
  [577.0161338522802,  7.0, "Finger 4", 0],
];

// s ≥ finger3_z  → upper straight segment
upper_holes = [
  [691.1935085687628, 7.0, "Finger 3", 0],
  [786.3749082290533, 6.742546381351637, "Finger 2", 0],
  [839.5580053756674, 7.000929854761667, "Finger 1", 0],
  [924.0,             6.966475345531341, "Thumb", 180],
  [1018.4570936132383, 2.3777264967168636, "Vent", 180],
];

hole_span      = outer_diameter_mm + 20;
bell_chamfer_h = 8;
// One-sided hole cut depth: from just outside OD through near wall into bore.
hole_cut_depth = (outer_diameter_mm - bore_diameter_mm) / 2 + 1.2;

// Arc-length position on upper segment → world Z coordinate on the upper cylinder
function upper_z(s) = finger4_z - (s - finger3_z);
function clampv(x, lo, hi) = x < lo ? lo : (x > hi ? hi : x);
function v_dot(a, b) = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function v_norm(v) = sqrt(v_dot(v, v));
function v_unit(v) =
  let(n = v_norm(v))
  n < 1e-9 ? [0, 0, 1] : [v[0] / n, v[1] / n, v[2] / n];
function v_sub(a, b) = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

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
module upper_main_seg(d) {
  if (upper_main_len > 0)
    translate([upper_x, 0, finger4_z - upper_main_len])
      cylinder(h = upper_main_len, d = d);
}

// Straight mouthpiece tail: same axis as upper_main_seg, reduced OD.
module upper_tail_seg_bent(d) {
  if (upper_tail_len > 0)
    translate([upper_x, 0, finger4_z - upper_main_len - upper_tail_len])
      cylinder(h = upper_tail_len, d = d);
}

// Split outer upper segment so the final mouthpiece-side length uses a smaller OD.
module upper_seg_outer() {
  union() {
    upper_main_seg(outer_diameter_mm);
    upper_tail_seg_bent(mouthpiece_tail_od_mm);
  }
}

// Full path at diameter d
module tube_path_uniform(d) {
  union() {
    lower_seg(d);
    half_torus(d);
    upper_main_seg(d);
    upper_tail_seg_bent(d);
  }
}

module outer_path() {
  union() {
    lower_seg(outer_diameter_mm);
    half_torus(outer_diameter_mm);
    upper_seg_outer();
  }
}

// ─── Hole cuts ────────────────────────────────────────────────────────────────

module cut_lower_holes() {
  for (h = lower_holes)
    translate([0, outer_diameter_mm / 2 + 0.2, h[0]])
      rotate([0, 0, -90 + h[3]])
        rotate([0, 90, 0])
          cylinder(h = hole_cut_depth, d = h[1], center = false);
}

module cut_upper_holes() {
  for (h = upper_holes)
    translate([upper_x, outer_diameter_mm / 2 + 0.2, upper_z(h[0])])
      rotate([0, 0, -90 + h[3]])
        rotate([0, 90, 0])
          cylinder(h = hole_cut_depth, d = h[1], center = false);
}

// ─── Labels ──────────────────────────────────────────────────────────────────
label_size  = 5;
label_depth = 1.4;
label_pad   = 3.0;

// Lower holes, +Y side.
module label_lower_holes_pos_y() {
  for (h = lower_holes)
    translate([outer_diameter_mm / 2 + label_pad, outer_diameter_mm / 2 + label_pad, -h[0]])
      rotate([90, 0, 180])
        linear_extrude(label_depth)
          text(h[2], size = label_size, halign = "left", valign = "center");
}

// Lower holes, -Y side.
module label_lower_holes_neg_y() {
  for (h = lower_holes)
    translate([outer_diameter_mm / 2 + label_pad, -outer_diameter_mm / 2 - label_pad, -h[0]])
      rotate([-90, 0, 180])
        linear_extrude(label_depth)
          text(h[2], size = label_size, halign = "left", valign = "center");
}

// Upper holes, +Y side.
module label_upper_holes_pos_y() {
  for (h = upper_holes)
    translate([upper_x - outer_diameter_mm / 2 - label_pad, outer_diameter_mm / 2 + label_pad, -upper_z(h[0])])
      rotate([90, 0, 180])
        linear_extrude(label_depth)
          text(h[2], size = label_size, halign = "left", valign = "center");
}

// Upper holes, -Y side.
module label_upper_holes_neg_y() {
  for (h = upper_holes)
    translate([upper_x - outer_diameter_mm / 2 - label_pad, -outer_diameter_mm / 2 - label_pad, -upper_z(h[0])])
      rotate([-90, 0, 180])
        linear_extrude(label_depth)
          text(h[2], size = label_size, halign = "left", valign = "center");
}

// ─── Assembly ─────────────────────────────────────────────────────────────────
// mirror([0,0,1]) flips the model so the bell faces up (+Z) and the mouthpiece
// faces down. translate brings the lowest point back to z=0 after the flip.
model_total_h = lower_len + bell_chamfer_h;

translate([0, 0, model_total_h])
mirror([0, 0, 1]) {
  difference() {
    outer_path();
    tube_path_uniform(bore_diameter_mm);
    cut_lower_holes();
    cut_upper_holes();
  }

  // Double mirror cancels the Z-flip for label geometry so text stays upright.
  color("White") mirror([0, 0, 1]) {
    label_lower_holes_pos_y();
    label_lower_holes_neg_y();
    label_upper_holes_pos_y();
    label_upper_holes_neg_y();
  }

  // ─── Bell chamfer ───────────────────────────────────────────────────────────
  color("FireBrick")
    translate([0, 0, -bell_chamfer_h])
      difference() {
        cylinder(h = bell_chamfer_h,
                 d1 = outer_diameter_mm + 2 * bell_chamfer_h,
                 d2 = outer_diameter_mm);
        translate([0, 0, -1])
          cylinder(h = bell_chamfer_h + 2, d = bore_diameter_mm);
      }
}
