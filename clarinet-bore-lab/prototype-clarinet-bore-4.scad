// OpenSCAD model generated from prototype-clarinet-bore-4.txt
// Units: millimeters
// Coordinate system: centerline arc-length s starts at bell and runs to mouthpiece.

$fn = 96;

// ----------------------
// Core body dimensions
// ----------------------
body_length_mm = 1291;
outer_diameter_mm = 24;
bore_diameter_mm = 15.87;

// Bend the body 180 degrees at the midpoint between Finger 4 and Finger 3.
finger4_z_mm = 577.0161338522802;
finger3_z_mm = 691.1935085687628;
bend_mid_s_mm = (finger4_z_mm + finger3_z_mm) / 2;
bend_radius_mm = 60;
bend_arc_len_mm = PI * bend_radius_mm;
bend_start_s_mm = bend_mid_s_mm - bend_arc_len_mm / 2;
bend_end_s_mm = bend_mid_s_mm + bend_arc_len_mm / 2;

path_sample_mm = 8;

// Optional visual extension for the mouthpiece shank geometry from source data.
show_mouthpiece_stub = false;
mouthpiece_insert_mm = 24;
mouthpiece_overall_mm = 110;
mouthpiece_bore_mm = 16.8;
mouthpiece_outer_diameter_mm = 29;

// ----------------------
// Finger holes
// [label, z_mm, hole_d_mm, angle_deg]
// ----------------------
finger_holes = [
  ["Finger 7", 226.8669870587032, 7.5, 0],
  ["Finger 6", 376.98842615369705, 5.5, 0],
  ["Finger 5", 448.86064839718773, 7.0, 0],
  ["Finger 4", 577.0161338522802, 7.0, 0],
  ["Finger 3", 691.1935085687628, 7.0, 0],
  ["Finger 2", 786.3749082290533, 7.0, 0],
  ["Finger 1", 839.5580053756674, 7.0, 0],
  ["Thumb",    924.0,             7.0, 0]
];

hole_cut_span_mm = outer_diameter_mm + 20;

function clamp01(x) = x < 0 ? 0 : (x > 1 ? 1 : x);
function clampv(x, lo, hi) = x < lo ? lo : (x > hi ? hi : x);
function v_dot(a, b) = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function v_norm(v) = sqrt(v_dot(v, v));
function v_unit(v) =
  let(n = v_norm(v))
  n < 1e-9 ? [1, 0, 0] : [v[0] / n, v[1] / n, v[2] / n];

function path_point(s_raw) =
  let(s = clampv(s_raw, 0, body_length_mm))
  s <= bend_start_s_mm
    ? [0, 0, s]
    : (s < bend_end_s_mm
      ? let(
          u = s - bend_start_s_mm,
          theta = 180 * clamp01(u / bend_arc_len_mm)
        )
        [
          -bend_radius_mm + bend_radius_mm * cos(theta),
          0,
          bend_start_s_mm + bend_radius_mm * sin(theta)
        ]
      : [
          -2 * bend_radius_mm,
          0,
          bend_start_s_mm - (s - bend_end_s_mm)
        ]);

function path_tangent(s_raw) =
  let(s = clampv(s_raw, 0, body_length_mm))
  s <= bend_start_s_mm
    ? [0, 0, 1]
    : (s < bend_end_s_mm
      ? let(
          u = s - bend_start_s_mm,
          theta = 180 * clamp01(u / bend_arc_len_mm)
        )
        v_unit([-sin(theta), 0, cos(theta)])
      : [0, 0, -1]);

function path_outward(s_raw) =
  let(s = clampv(s_raw, 0, body_length_mm))
  s <= bend_start_s_mm
    ? [1, 0, 0]
    : (s < bend_end_s_mm
      ? let(
          u = s - bend_start_s_mm,
          theta = 180 * clamp01(u / bend_arc_len_mm)
        )
        v_unit([cos(theta), 0, sin(theta)])
      : [-1, 0, 0]);

module orient_x_to(v) {
  vv = v_unit(v);
  axis = cross([1, 0, 0], vv);
  axis_n = v_norm(axis);
  angle = acos(clampv(v_dot([1, 0, 0], vv), -1, 1));

  if (axis_n < 1e-9) {
    if (v_dot([1, 0, 0], vv) >= 0) {
      children();
    } else {
      rotate([0, 180, 0]) children();
    }
  } else {
    rotate(a = angle, v = axis) children();
  }
}

module swept_tube(d_mm, s_start_mm, s_end_mm, ds_mm) {
  steps = max(1, ceil((s_end_mm - s_start_mm) / ds_mm));
  for (i = [0 : steps - 1]) {
    s0 = s_start_mm + (s_end_mm - s_start_mm) * (i / steps);
    s1 = s_start_mm + (s_end_mm - s_start_mm) * ((i + 1) / steps);
    hull() {
      translate(path_point(s0)) sphere(d = d_mm);
      translate(path_point(s1)) sphere(d = d_mm);
    }
  }
}

module body_blank() {
  swept_tube(outer_diameter_mm, 0, body_length_mm, path_sample_mm);
}

module bore_cut() {
  // Over-run start/end to ensure complete subtraction.
  swept_tube(bore_diameter_mm, -1, body_length_mm + 1, path_sample_mm);
}

module finger_hole_cut(s_mm, d_mm, angle_deg) {
  p = path_point(s_mm);
  t = path_tangent(s_mm);
  n = path_outward(s_mm);

  translate(p)
    rotate(a = angle_deg, v = t)
      orient_x_to(n)
        cylinder(h = hole_cut_span_mm, d = d_mm, center = true);
}

module clarinet_body_with_holes() {
  difference() {
    body_blank();
    bore_cut();

    for (hole = finger_holes) {
      finger_hole_cut(hole[1], hole[2], hole[3]);
    }
  }
}

module mouthpiece_stub() {
  // Simple visual stub to reflect source mouthpiece metadata.
  // This is not an acoustically detailed mouthpiece model.
  s0 = body_length_mm - mouthpiece_insert_mm;
  s1 = s0 + mouthpiece_overall_mm;
  difference() {
    swept_tube(mouthpiece_outer_diameter_mm, s0, s1, path_sample_mm);
    swept_tube(mouthpiece_bore_mm, s0 - 1, s1 + 1, path_sample_mm);
  }
}

clarinet_body_with_holes();

if (show_mouthpiece_stub) {
  mouthpiece_stub();
}
