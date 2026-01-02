// Vercel Serverless Function for Oura API Proxy
// Deploy this to Vercel to use with GitHub Pages
// 
// To deploy:
// 1. Install Vercel CLI: npm i -g vercel
// 2. Run: vercel
// 3. Your function will be at: https://your-project.vercel.app/api/fetch-oura
// 4. Add this URL to your config in index.html as "Oura Proxy URL"

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

    // Oura's data model for static metrics:
    // - Sleep Score and Readiness are calculated in the morning and associated with the CURRENT day
    //   (they represent the previous night's sleep/previous day's activity, but the record is dated for today)
    // - All metrics are static and don't change during the day
    // - We only track: Readiness Score, Previous Day Activity, Sleep Score, Total Sleep
    
    const today = new Date();
    const todayDate = date || today.toISOString().split('T')[0];
    
    // All metrics come from today's date (static metrics calculated in the morning)
    const targetDate = todayDate;

    // Fetch only the static metrics we need (all from today's date)
    const [sleepResponse, readinessResponse] = await Promise.all([
      fetch(`https://api.ouraring.com/v2/usercollection/daily_sleep?start_date=${targetDate}&end_date=${targetDate}`, {
        headers: { 'Authorization': `Bearer ${ouraToken}` }
      }),
      fetch(`https://api.ouraring.com/v2/usercollection/daily_readiness?start_date=${targetDate}&end_date=${targetDate}`, {
        headers: { 'Authorization': `Bearer ${ouraToken}` }
      })
    ]);

    // Parse responses with error handling
    let sleepData = null;
    let readinessData = null;
    
    try {
      sleepData = sleepResponse.ok ? await sleepResponse.json() : null;
      if (!sleepResponse.ok && sleepResponse.status !== 404) {
        console.error('Sleep API error:', sleepResponse.status, await sleepResponse.text());
      }
    } catch (e) {
      console.error('Error parsing sleep data:', e);
    }
    
    try {
      readinessData = readinessResponse.ok ? await readinessResponse.json() : null;
      if (!readinessResponse.ok && readinessResponse.status !== 404) {
        console.error('Readiness API error:', readinessResponse.status, await readinessResponse.text());
      }
    } catch (e) {
      console.error('Error parsing readiness data:', e);
    }

    // Extract the 4 static metrics we track
    const sleep = sleepData?.data?.[0] || null;
    const readiness = readinessData?.data?.[0] || null;
    
    // Extract specific fields
    const sleepScore = sleep?.score || null;
    const totalSleep = sleep?.contributors?.total_sleep || null;
    const readinessScore = readiness?.score || null;
    const previousDayActivity = readiness?.contributors?.previous_day_activity || null;

    // If no data for today, try yesterday as fallback (data might not be processed yet)
    if (!sleep && !readiness) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const fallbackDate = yesterday.toISOString().split('T')[0];
      
      const fallbackSleepResponse = await fetch(`https://api.ouraring.com/v2/usercollection/daily_sleep?start_date=${fallbackDate}&end_date=${fallbackDate}`, {
        headers: { 'Authorization': `Bearer ${ouraToken}` }
      });
      const fallbackReadinessResponse = await fetch(`https://api.ouraring.com/v2/usercollection/daily_readiness?start_date=${fallbackDate}&end_date=${fallbackDate}`, {
        headers: { 'Authorization': `Bearer ${ouraToken}` }
      });
      
      const fallbackSleepData = fallbackSleepResponse.ok ? await fallbackSleepResponse.json() : null;
      const fallbackReadinessData = fallbackReadinessResponse.ok ? await fallbackReadinessResponse.json() : null;
      
      if (fallbackSleepData?.data?.[0] || fallbackReadinessData?.data?.[0]) {
        const fallbackSleep = fallbackSleepData?.data?.[0] || null;
        const fallbackReadiness = fallbackReadinessData?.data?.[0] || null;
        
        return res.status(200).json({
          sleepScore: fallbackSleep?.score || null,
          totalSleep: fallbackSleep?.contributors?.total_sleep || null,
          readinessScore: fallbackReadiness?.score || null,
          previousDayActivity: fallbackReadiness?.contributors?.previous_day_activity || null,
          dataDate: fallbackDate
        });
      }
    }

    // Return only the 4 static metrics we track
    return res.status(200).json({
      sleepScore: sleepScore,
      totalSleep: totalSleep,
      readinessScore: readinessScore,
      previousDayActivity: previousDayActivity,
      dataDate: targetDate
    });

  } catch (error) {
    console.error('Error fetching Oura data:', error);
    console.error('Error stack:', error.stack);
    console.error('Error name:', error.name);
    
    return res.status(500).json({ 
      error: 'Failed to fetch Oura data',
      message: error.message
    });
  }
}

