# SpendWise - Smart Budget Planning Simulator

A client-side budget planner built with HTML, CSS and JavaScript. No build step, no dependencies, no backend.
Data is saved in the browser's Local Storage.

## Files

| File | Purpose |
| --- | --- |
| index.html | Page structure |
| style.css | Styling and responsive layout |
| app.js | Logic: validation, calculations, alerts, chart, storage, CSV export |
| staticwebapp.config.json | Azure Static Web Apps settings |

## Run locally

Open `index.html` in a browser. No server is needed.

## Deploy to Azure Static Web Apps with GitHub

1. Create a new empty repository on GitHub (for example `spendwise`).
2. Upload or push these files to the **root** of the repository (so `index.html` is at the top level, not inside a subfolder).
3. In the Azure portal, choose **Create a resource > Static Web App**.
4. Fill in:
   - Subscription and Resource group (create one if needed)
   - Name: `spendwise` (or any name)
   - Plan type: **Free**
   - Source: **GitHub**, then sign in and pick your organization, repository and branch (`main`)
5. Under **Build Details** set:
   - Build Presets: **Custom**
   - App location: `/`
   - Api location: leave empty
   - Output location: leave empty
6. Click **Review + create**, then **Create**.
7. Azure adds a GitHub Actions workflow to your repo and deploys automatically. Wait for the action to finish (check the **Actions** tab on GitHub).
8. Open the **URL** shown on the Static Web App's Overview page in Azure.

Every later push to `main` redeploys the site automatically.

## Troubleshooting

- **Blank or default Azure page:** the files are not in the repository root, or App location is wrong. It must be `/`.
- **Workflow failed:** open the failed run in the GitHub Actions tab and check the "Build and Deploy" step log. Confirm Output location is empty.
- **Data missing after reload:** Local Storage is per browser and device, and private browsing may block it.
