# GitHub Pages Setup Guide

This guide explains how to deploy this health tracker app to GitHub Pages instead of Netlify.

## The Challenge

GitHub Pages only serves static files (HTML, CSS, JavaScript). It doesn't support serverless functions like Netlify does. The app currently uses a Netlify Function to proxy Oura API calls (to avoid CORS issues).

## Solution Options

### Option 1: Use Direct API Calls (May Not Work)

The app will try to call the Oura API directly from the browser. However, the Oura API likely doesn't allow CORS, so this will probably fail. If it does fail, you'll see a CORS error.

### Option 2: Use a Free Proxy Service (Recommended)

Since direct API calls likely won't work, you need a proxy service. Here are free options:

#### A. Vercel (Easiest - Similar to Netlify)

1. **Create a Vercel account** at [vercel.com](https://vercel.com) (free)

2. **Create a new function** in your repository:
   - Create folder: `api/fetch-oura.js`
   - Copy the code from `netlify/functions/fetch-oura.js` and adapt it for Vercel

3. **Deploy to Vercel:**
   ```bash
   npm i -g vercel
   vercel
   ```

4. **Update your config** in `index.html`:
   - Add `ouraProxyUrl: 'https://your-project.vercel.app/api/fetch-oura'` to your config

#### B. Cloudflare Workers (Free Tier Available)

1. **Create a Cloudflare account** at [cloudflare.com](https://cloudflare.com)

2. **Create a Worker** with the Oura proxy code

3. **Update your config** with the Worker URL

#### C. Use an Existing CORS Proxy (Not Recommended for Production)

You could use a public CORS proxy, but this is not secure for API keys.

### Option 3: Keep Netlify Function, Deploy Frontend to GitHub Pages

1. Deploy the Netlify function separately (keep it on Netlify)
2. Update the frontend to point to your Netlify function URL
3. Deploy the frontend to GitHub Pages

## Recommended Setup: Vercel Proxy

### Step 1: Create Vercel Function

Create `api/fetch-oura.js` in your repository:

```javascript
export default async function handler(req, res) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { ouraToken, date } = req.body;

    if (!ouraToken) {
      return res.status(400).json({ error: 'Oura token is required' });
    }

    const today = new Date();
    const todayDate = date || today.toISOString().split('T')[0];
    const targetDate = todayDate;

    // Fetch from Oura API
    const [sleepResponse, readinessResponse] = await Promise.all([
      fetch(`https://api.ouraring.com/v2/usercollection/daily_sleep?start_date=${targetDate}&end_date=${targetDate}`, {
        headers: { 'Authorization': `Bearer ${ouraToken}` }
      }),
      fetch(`https://api.ouraring.com/v2/usercollection/daily_readiness?start_date=${targetDate}&end_date=${targetDate}`, {
        headers: { 'Authorization': `Bearer ${ouraToken}` }
      })
    ]);

    let sleepData = null;
    let readinessData = null;
    
    try {
      sleepData = sleepResponse.ok ? await sleepResponse.json() : null;
    } catch (e) {
      console.error('Error parsing sleep data:', e);
    }
    
    try {
      readinessData = readinessResponse.ok ? await readinessResponse.json() : null;
    } catch (e) {
      console.error('Error parsing readiness data:', e);
    }

    const sleep = sleepData?.data?.[0] || null;
    const readiness = readinessData?.data?.[0] || null;
    
    const sleepScore = sleep?.score || null;
    const totalSleep = sleep?.contributors?.total_sleep || null;
    const readinessScore = readiness?.score || null;
    const previousDayActivity = readiness?.contributors?.previous_day_activity || null;

    return res.status(200).json({
      sleepScore: sleepScore,
      totalSleep: totalSleep,
      readinessScore: readinessScore,
      previousDayActivity: previousDayActivity,
      dataDate: targetDate
    });

  } catch (error) {
    console.error('Error fetching Oura data:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch Oura data',
      message: error.message
    });
  }
}
```

### Step 2: Deploy to Vercel

1. Install Vercel CLI: `npm i -g vercel`
2. Run `vercel` in your project directory
3. Follow the prompts to deploy
4. Note your deployment URL (e.g., `https://your-project.vercel.app`)

### Step 3: Update Frontend Config

In `index.html`, add the proxy URL to your config. You can do this by:

1. **Option A**: Edit the config section to include a proxy URL field
2. **Option B**: Hardcode it (not recommended, but simpler):
   ```javascript
   config.ouraProxyUrl = 'https://your-project.vercel.app/api/fetch-oura';
   ```

### Step 4: Deploy to GitHub Pages

1. **Enable GitHub Pages** in your repository settings:
   - Go to Settings → Pages
   - Select source branch (usually `main` or `gh-pages`)
   - Select folder (usually `/root` or `/docs`)

2. **Your site will be available at:**
   - `https://yourusername.github.io/health-tracker-app/`

## Alternative: Simple Setup Without Proxy

If you don't want to set up a proxy, you can:

1. **Skip Oura integration** - Leave the Oura token blank
2. **Use the app without Oura data** - All other features will work

## GitHub Actions Auto-Deploy (Optional)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./
```

This will automatically deploy your site when you push to main.

## Summary

1. **Easiest**: Use Vercel for the proxy function (free, similar to Netlify)
2. **Alternative**: Use Cloudflare Workers
3. **Simplest**: Skip Oura integration if you don't need it
4. **Hybrid**: Keep Netlify function, deploy frontend to GitHub Pages

The app code has been updated to support both direct API calls and proxy URLs, so it will work with any of these setups.

