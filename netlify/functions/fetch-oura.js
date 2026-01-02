// netlify/functions/fetch-oura.js
// Serverless function to fetch Oura data without CORS issues

// Note: Netlify Functions run on Node.js 18+ which has native fetch support

exports.handler = async function(event, context) {
  // Handle CORS preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Parse request body
    let requestBody;
    try {
      requestBody = JSON.parse(event.body);
    } catch (parseError) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'Invalid JSON in request body', message: parseError.message })
      };
    }
    
    // Get the Oura token and optional date from the request
    const { ouraToken, date } = requestBody;

    if (!ouraToken) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'Oura token is required' })
      };
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
        
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type'
          },
          body: JSON.stringify({
            sleepScore: fallbackSleep?.score || null,
            totalSleep: fallbackSleep?.contributors?.total_sleep || null,
            readinessScore: fallbackReadiness?.score || null,
            previousDayActivity: fallbackReadiness?.contributors?.previous_day_activity || null,
            dataDate: fallbackDate
          })
        };
      }
    }

    // Return only the 4 static metrics we track
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({
        sleepScore: sleepScore,
        totalSleep: totalSleep,
        readinessScore: readinessScore,
        previousDayActivity: previousDayActivity,
        dataDate: targetDate
      })
    };

  } catch (error) {
    console.error('Error fetching Oura data:', error);
    console.error('Error stack:', error.stack);
    console.error('Error name:', error.name);
    
    // Return detailed error for debugging
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        error: 'Failed to fetch Oura data',
        message: error.message,
        details: process.env.NETLIFY_DEV ? error.stack : undefined,
        type: error.name
      })
    };
  }
};
