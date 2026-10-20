# Evaluation datasets

Real photos have not been supplied. Do not manufacture an accuracy score from the synthetic catalog or unit-test fixtures.

For inward evaluation, create `inward/truth.csv` using the header in `truth.example.csv` and place photos beside it. `evaluatedAt` is the fixed ISO timestamp for evaluating that example. Label dates must be transcribed by a human; expectedVerdict uses green/amber/red against the active rule. Include expired packs and difficult labels. Do not include people or private data.

Run `node tools/eval/runInwardEval.js` with a configured MongoDB and vision provider. The tool measures the vision fallback path; browser barcode/OCR metrics need a separate captured browser run. It refuses to claim the 30-photo phase gate with fewer samples.
