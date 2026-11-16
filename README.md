# Classroom Grade Calculator

A Chrome / Brave extension that calculates your overall grade on the Google
Classroom **Your work** page, including when the teacher has hidden the overall
grade. Supports weighted categories, grading periods and what-if scores.

## Install

1. Download this folder (Code → Download ZIP, then unzip) or clone the repo.
2. Open `chrome://extensions` (or `brave://extensions`).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick this folder (the one containing `manifest.json`).

## Use

1. In Classroom open a class → **Classwork** → **View your work**.
2. Keep the task filter on **All** and scroll to the bottom so every assignment is loaded.
3. The panel in the top-right shows your grade. Click its header to collapse it.

- **Total points**: points earned ÷ points possible across all graded work.
- **Weighted by category**: type each category's weight (from your syllabus —
  Classroom does not show weights when the grade is hidden). Each category's
  score is its points earned ÷ points possible; categories with no graded work
  yet are left out and the remaining weights rescaled, the same way Classroom does it.
- **What-if**: open *Assignments* and type a score into any assignment (for
  ungraded work, fill in both the score and the points possible).
- Ungraded, missing-without-a-score and excused work is not counted.

Weights and what-ifs are saved per class, on your computer only. The extension
makes no network requests.

## Limits

- Reads the page text, so it expects Classroom in English.
- It can only see assignments that are loaded on the page.

## Development

```bash
node --test test/grade.test.js   # grade math
node test/e2e.js                 # loads the extension against mock pages (needs Playwright)
```
