# Local Plotly 3D axis label padding

The bundled renderer uses tickPad 26 and labelPad 36. Its native world-space minor-axis padding collapsed when the camera approached a side view. crystalliteAxisLabelOffset now projects the axis direction into the camera plane, takes an outward unit perpendicular, and transforms it back to model coordinates. Padding is recalculated on every render and remains separated on screen during rotation and zoom. Mesh coordinates, physical axis ratios and tick values are unchanged.

The same renderer is embedded in the application, standalone exports and PNG rendering. Tests cover grazing angles, nonuniform model scaling and perpendicularity. When replacing the Plotly bundle, reapply or retire this local adjustment and visually check 3D, Top, Side and near-profile rotations.
