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
    
    // Get the Oura token and mode from the request
    const { ouraToken, mode, date } = requestBody;

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

    // Determine dates based on mode
    // Morning: needs yesterday's sleep/readiness (last night) and today's activity (in progress)
    // Evening: needs today's sleep/readiness (last night) and today's activity (completed)
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const todayDate = date || today.toISOString().split('T')[0];
    const yesterdayDate = yesterday.toISOString().split('T')[0];
    
    // For morning check-ins, we want yesterday's sleep data (the night that just ended)
    // For evening check-ins, we want today's activity data (the day that's ending)
    const sleepDate = mode === 'morning' ? yesterdayDate : todayDate;
    const activityDate = todayDate; // Always use today for activity (it's the day in progress or just completed)

    // Fetch sleep and readiness data (from the night that ended)
    const [sleepResponse, readinessResponse, sleepTimeResponse, heartrateResponse] = await Promise.all([
      fetch(`https://api.ouraring.com/v2/usercollection/daily_sleep?start_date=${sleepDate}&end_date=${sleepDate}`, {
        headers: { 'Authorization': `Bearer ${ouraToken}` }
      }),
      fetch(`https://api.ouraring.com/v2/usercollection/daily_readiness?start_date=${sleepDate}&end_date=${sleepDate}`, {
        headers: { 'Authorization': `Bearer ${ouraToken}` }
      }),
      fetch(`https://api.ouraring.com/v2/usercollection/sleep?start_date=${sleepDate}&end_date=${sleepDate}`, {
        headers: { 'Authorization': `Bearer ${ouraToken}` }
      }),
      fetch(`https://api.ouraring.com/v2/usercollection/heartrate?start_date=${sleepDate}&end_date=${sleepDate}`, {
        headers: { 'Authorization': `Bearer ${ouraToken}` }
      })
    ]);

    // Fetch activity data (for the day in progress/completed)
    const activityResponse = await fetch(`https://api.ouraring.com/v2/usercollection/daily_activity?start_date=${activityDate}&end_date=${activityDate}`, {
      headers: { 'Authorization': `Bearer ${ouraToken}` }
    });

    // Parse responses with error handling
    let sleepData = null;
    let readinessData = null;
    let activityData = null;
    let sleepTimeData = null;
    let heartrateData = null;
    
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
    
    try {
      activityData = activityResponse.ok ? await activityResponse.json() : null;
      if (!activityResponse.ok && activityResponse.status !== 404) {
        console.error('Activity API error:', activityResponse.status, await activityResponse.text());
      }
    } catch (e) {
      console.error('Error parsing activity data:', e);
    }
    
    try {
      sleepTimeData = sleepTimeResponse.ok ? await sleepTimeResponse.json() : null;
      if (!sleepTimeResponse.ok && sleepTimeResponse.status !== 404) {
        console.error('Sleep time API error:', sleepTimeResponse.status, await sleepTimeResponse.text());
      }
    } catch (e) {
      console.error('Error parsing sleep time data:', e);
    }
    
    try {
      heartrateData = heartrateResponse.ok ? await heartrateResponse.json() : null;
      if (!heartrateResponse.ok && heartrateResponse.status !== 404) {
        console.error('Heart rate API error:', heartrateResponse.status, await heartrateResponse.text());
      }
    } catch (e) {
      console.error('Error parsing heart rate data:', e);
    }

    // Extract sleep data
    const sleep = sleepData?.data?.[0] || null;
    const readiness = readinessData?.data?.[0] || null;
    const activity = activityData?.data?.[0] || null;
    
    // Try multiple sources for sleep duration
    // 1. From sleep endpoint (total_sleep_duration)
    // 2. From daily_sleep endpoint (total_sleep_duration or sleep_duration)
    let sleepDuration = sleepTimeData?.data?.[0]?.total_sleep_duration || null;
    if (!sleepDuration && sleep) {
      sleepDuration = sleep.total_sleep_duration || sleep.sleep_duration || null;
    }
    
    // Convert sleep duration from seconds to hours (rounded to 1 decimal)
    const sleepHours = sleepDuration ? (parseFloat(sleepDuration) / 3600).toFixed(1) : null;
    
    // Extract activity metrics - check multiple possible field names
    const steps = activity?.steps || activity?.step_count || null;
    const activeCalories = activity?.active_calories || activity?.cal_active || null;
    
    // Process heart rate data to find lowest resting HR
    let lowestRestingHR = null;
    if (heartrateData?.data && heartrateData.data.length > 0) {
      // Filter for sleep/rest sources and find minimum
      const restingReadings = heartrateData.data
        .filter(reading => {
          const source = reading.source || reading.type;
          return source === 'sleep' || source === 'rest' || source === 'session';
        })
        .map(reading => reading.bpm || reading.heart_rate)
        .filter(bpm => bpm != null && !isNaN(bpm));
      
      if (restingReadings.length > 0) {
        lowestRestingHR = Math.min(...restingReadings);
      }
    }

    // If no sleep data found for the target date, try the other date as fallback
    if (!sleep && !readiness && mode === 'morning') {
      // Try today's data as fallback
      const fallbackSleepResponse = await fetch(`https://api.ouraring.com/v2/usercollection/daily_sleep?start_date=${todayDate}&end_date=${todayDate}`, {
        headers: { 'Authorization': `Bearer ${ouraToken}` }
      });
      const fallbackReadinessResponse = await fetch(`https://api.ouraring.com/v2/usercollection/daily_readiness?start_date=${todayDate}&end_date=${todayDate}`, {
        headers: { 'Authorization': `Bearer ${ouraToken}` }
      });
      
      const fallbackSleepData = fallbackSleepResponse.ok ? await fallbackSleepResponse.json() : null;
      const fallbackReadinessData = fallbackReadinessResponse.ok ? await fallbackReadinessResponse.json() : null;
      
      if (fallbackSleepData?.data?.[0] || fallbackReadinessData?.data?.[0]) {
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type'
          },
          body: JSON.stringify({
            sleep: fallbackSleepData?.data?.[0] || null,
            readiness: fallbackReadinessData?.data?.[0] || null,
            activity: activity,
            sleepDuration: fallbackSleepData?.data?.[0]?.total_sleep_duration || fallbackSleepData?.data?.[0]?.sleep_duration || null,
            sleepHours: fallbackSleepData?.data?.[0]?.total_sleep_duration ? (parseFloat(fallbackSleepData.data[0].total_sleep_duration) / 3600).toFixed(1) : (fallbackSleepData?.data?.[0]?.sleep_duration ? (parseFloat(fallbackSleepData.data[0].sleep_duration) / 3600).toFixed(1) : null),
            steps: steps,
            lowestRestingHR: lowestRestingHR,
            activeCalories: activeCalories,
            dataDate: todayDate,
            note: 'Using today\'s data (yesterday not yet available)'
          })
        };
      }
    }

    // Return the combined data
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({
        sleep: sleep,
        readiness: readiness,
        activity: activity,
        sleepDuration: sleepDuration,
        sleepHours: sleepHours,
        steps: steps,
        lowestRestingHR: lowestRestingHR,
        activeCalories: activeCalories,
        dataDate: mode === 'morning' ? yesterdayDate : todayDate,
        activityDate: activityDate,
        note: mode === 'morning' 
          ? `Sleep data from ${yesterdayDate} (last night), activity from ${activityDate} (in progress)`
          : `Sleep data from ${sleepDate}, activity from ${activityDate} (today)`
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
