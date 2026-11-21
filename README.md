# Anisotropy Plotter (Crystallite Size and Strain)

Developed by **Dr. Alexander Resentera**, Universidad Nacional de Cuyo.
Built with assistance from **OpenAI Codex**.

ORCID: https://orcid.org/0000-0002-5231-7304 · Contact: r_alex_07@hotmail.com

An offline browser application for visualizing anisotropy from refinements performed in FullProf. This independent application is not an official FullProf product.

## Citation

If you use this software in your research, please cite:

> Resentera, A. (2026). *Anisotropy Plotter (Crystallite Size and Strain)* (Version 1.0.0) [Computer software]. GitHub. https://github.com/alexanderresentera/anisotropy-plotter

Machine-readable metadata are in `CITATION.cff`. No DOI is required or assigned. When citing a published release, also specify its version/tag for reproducibility. The repository link above does not imply that release v1.0.0 has already been published.

## Download and run

Download `dist/Anisotropy Plotter (Crystallite Size and Strain).html` and open the downloaded file in a desktop browser with WebGL support. No installation or server is needed. Files are processed in the browser; documentation links open online. Viewing the HTML source on GitHub does not launch the app.

Select all files from the same refinement together, select the phase/dataset, and click **Generate plot**. A new file selection replaces the previous set.

- **Size:** `.siz` + `.pcr` + matching `_size_n.bin` or `.ggrid`. `.out` and `.mic` are optional. The current implementation still requires a matching grid even when displaying SIZ.
- **Strain:** `.str` + `.pcr` + matching `_strain_n.bin` or `.ggrid`. `.out` is optional; SIZ is not required.
- Grid and directional-file basenames must match. When BIN and GGRID are both supplied, their voxel arrays must agree.

## Representations

**SIZ radial (default for size):** represents each directional apparent size using `r = Dh/2`. The input lengths are in angstroms; displayed physical units can be Å, nm, or µm. This is a visualization of directional apparent sizes, not a unique reconstruction of a physical particle.

**FullProf grid (optional for size; used for strain):** reads a two-level binary grid and extracts a half-level isosurface using marching tetrahedra. BIN is preferred when both formats are present. Its axes are dimensionless, centered on the surface bounding box. An absolute physical calibration of this grid is not established. Colors show radius in grid coordinates, not Dh or strain magnitude. GFourier may use a different contour level or interpolation.

Top, Side, Top + Side, three palettes, standalone HTML and PNG exports are available. HTML exports preserve the available representation choices. PNG exports the selected view. SIZ/MIC metrics and conditional cylindrical platelet estimates are separate from dimensions of the binary surface.

## Scientific scope and limitations

- FullProf describes apparent size as volume-averaged column lengths in the direction normal to the diffracting planes. External particle dimensions require additional interpretation.
- Supported grid inputs are full scalar real GGRID v3 with orthogonal cubic plotting cell, and validated FullProf BIN descriptors with variable header lengths. Only closed two-level masks are accepted, up to two million grid points; this is not a general density-map reader.
- Strain values retain the original STR file convention. No unstated strain multiplier is assumed. Strain coefficients are not yet cross-validated against PCR/OUT; multiple-pattern strain inputs are rejected.
- Not all FullProf size models yield a finite closed surface. Selective or ambiguous models are rejected; full symmetry compatibility is not certified solely from a space-group name.
- The supplied Plotly renderer has a documented local axis-spacing modification; see `vendor/AXIS-SPACING.md`.
- Automated tests and numerical comparisons do not replace visual/scientific validation. Interactive rendering has not been fully verified across browsers. Known limitations are disclosed rather than treated as certified behavior.

## Build and test

Node.js 18 or later is needed only for development. No npm installation is required.

```sh
node build.cjs
node --test tests/*.test.cjs
```

The build embeds the source and bundled Plotly into a standalone HTML. No personal refinement data are bundled. Tests use synthetic grids only.

## License and acknowledgments

Original project code and documentation are licensed under the GNU General Public License version 3 only (`GPL-3.0-only`). Copyright © 2026 Alexander Resentera. See `LICENSE` for the complete terms. Distributed without warranty. Plotly retains its MIT license and copyright; see `vendor/LICENSE-plotly.txt` and `THIRD_PARTY_NOTICES.md`. Codex assistance is acknowledged as a development tool, not listed as an author.

## References

- [FullProf manual](https://www.ill.eu/sites/fullprof/downloads/Docs/FullProf_Manual.pdf)
- [FullProf microstructure documentation, including Eq. (14)](https://www.ill.eu/sites/fullprof/downloads/Docs/Microstructural_effects.pdf)
- Casas-Cabanas et al., *New insights on the microstructural characterisation of nickel hydroxides*, J. Mater. Chem. 16 (2006), 2925–2939. The platelet estimates are conditional model calculations, separate from SIZ contour spans.

FullProf and literature PDFs are linked, not redistributed.
