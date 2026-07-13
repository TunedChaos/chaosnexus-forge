sed -i 's/| "anchor";/| "anchor"\n  | "machine-learning"\n  | "science";/' src/lib/dual_editor/node_catalog.ts

sed -i 's/anchor: "Anchors",/anchor: "Anchors",\n  "machine-learning": "Machine Learning",\n  science: "Scientific Math",/' src/lib/dual_editor/node_catalog.ts
