# Chrome Web Store listing

Copy each block into the matching field of the developer dashboard.

## Store listing tab

**Description**

```
See your overall grade in Google Classroom, even when your teacher has turned the overall grade off.

Classroom Grade Calculator reads the scores on a class's "Your work" page and shows your calculated grade right next to your name, where Classroom's own grade would normally be.

WHAT IT DOES
• Calculates your overall grade from the scores Classroom already shows you
• Total points or weighted by category: enter the weights from your syllabus once and they are remembered for each class
• Grading periods: pick a semester or quarter, or see all of them together
• What-if scores: type a score into any assignment, graded or not, to see how it would change your grade
• Your own categories: if tests or projects were posted without a category, create one and choose which assignments belong to it
• Ungraded, missing and excused work is left out until you enter a what-if score
• Light and dark mode

HOW TO USE IT
1. Open a class in Google Classroom, go to Classwork and click "View your work".
2. Keep the task filter on "All" and scroll to the bottom so every assignment is loaded.
3. Your grade appears beside your name. Click "View details" to set weights, add categories or try what-if scores.

PRIVATE BY DESIGN
• Everything is calculated in your browser
• Your weights and what-if scores are saved only on your computer
• No account, no sign-in, no ads, no tracking, and nothing is sent anywhere

GOOD TO KNOW
• The grade is an estimate based on the scores visible on the page and the weights you enter. Your teacher's official grade may differ, for example if they drop scores or grade work that is not posted.
• Works with Google Classroom in English.

This extension is not affiliated with, endorsed by or sponsored by Google. Google Classroom is a trademark of Google LLC.
```

**Category:** Education

**Language:** English (United States)

**Store icon:** `images/store-icon-128.png`

**Global promo video:** leave empty

**Screenshots** (upload in this order):

1. `images/1-grade-in-header.png`
2. `images/2-weighted-categories.png`
3. `images/3-what-if.png`
4. `images/4-custom-categories.png`

**Small promo tile:** `images/small-promo-440x280.png`

**Marquee promo tile:** `images/marquee-promo-1400x560.png`

**Official URL:** leave empty (only for a website you have verified in Search Console)

**Homepage URL:** `https://github.com/Jujified/grade-calc` (only if the repository is public; otherwise leave empty)

**Support URL:** `https://github.com/Jujified/grade-calc/issues` (same condition)

**Mature content:** off

## Privacy tab

**Single purpose**

```
Calculates and displays a student's overall grade on the Google Classroom "Your work" page, using the assignment scores shown on that page.
```

**Permission justification: storage**

```
Saves the user's own settings for each class (category weights, custom categories, what-if scores and whether the panel is open) locally in the browser so they do not have to be re-entered. Nothing is synced or sent anywhere.
```

**Host permission justification: https://classroom.google.com/***

```
The extension runs only on Google Classroom. It reads the assignment names, categories and scores displayed on the student's "Your work" page in order to calculate the overall grade, and adds the calculated grade to that page. It makes no network requests.
```

**Remote code:** No, I am not using remote code.

**Data usage:** tick nothing under "collects or uses". The extension reads page content only to do the calculation on the device and does not collect or transmit it.

Tick all three certifications (no selling data, no unrelated use, no creditworthiness use).

**Privacy policy URL:** needs a public link. The text below can be hosted anywhere public (for example a GitHub Pages page or a public Google Doc).

```
Privacy Policy for Classroom Grade Calculator

Classroom Grade Calculator does not collect, transmit, sell or share any personal data.

The extension reads the assignment names, categories and scores shown on the Google Classroom "Your work" page you are viewing, only to calculate your grade inside your browser.

Your settings (category weights, custom categories and what-if scores) are stored locally on your device using the browser's extension storage. They never leave your device and are deleted when you remove the extension.

The extension makes no network requests, uses no analytics and contains no ads.

Questions: <your contact email>
```

## Regenerating the images

```bash
node store/src/capture.js
```

This loads the real extension on `store/src/demo.html` (a made-up class with a made-up student) and writes the images to `store/images/`.
