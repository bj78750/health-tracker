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

    // Oura's data model:
    // - Sleep Score and Readiness are calculated in the morning and associated with the CURRENT day
    //   (they represent the previous night's sleep, but the record is dated for today)
    // - Sleep Hours come from the sleep data for the previous night
    // - Lowest Resting HR is from the previous day (can't be known until day is complete)
    // - Activity, Steps, Calories are for the current day (in progress)
    
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const todayDate = date || today.toISOString().split('T')[0];
    const yesterdayDate = yesterday.toISOString().split('T')[0];
    
    // Always fetch today's sleep/readiness (these are calculated in the morning for last night)
    // Always fetch today's activity (current day's activity)
    // Fetch yesterday's sleep duration and heart rate (for the night that ended)
    const sleepReadinessDate = todayDate; // Sleep Score and Readiness are dated for today
    const sleepDurationDate = yesterdayDate; // Sleep hours are from last night
    const heartrateDate = yesterdayDate; // Lowest HR is from previous day
    const activityDate = todayDate; // Activity is for current day

    // Fetch sleep and readiness data (today's date - these are calculated in the morning)
    const [sleepResponse, readinessResponse] = await Promise.all([
      fetch(`https://api.ouraring.com/v2/usercollection/daily_sleep?start_date=${sleepReadinessDate}&end_date=${sleepReadinessDate}`, {
        headers: { 'Authorization': `Bearer ${ouraToken}` }
      }),
      fetch(`https://api.ouraring.com/v2/usercollection/daily_readiness?start_date=${sleepReadinessDate}&end_date=${sleepReadinessDate}`, {
        headers: { 'Authorization': `Bearer ${ouraToken}` }
      })
    ]);
    
    // Fetch sleep duration from yesterday (the actual night that ended)
    const sleepTimeResponse = await fetch(`https://api.ouraring.com/v2/usercollection/sleep?start_date=${sleepDurationDate}&end_date=${sleepDurationDate}`, {
      headers: { 'Authorization': `Bearer ${ouraToken}` }
    });
    
    // Fetch heart rate from yesterday (for lowest resting HR)
    const heartrateResponse = await fetch(`https://api.ouraring.com/v2/usercollection/heartrate?start_date=${heartrateDate}&end_date=${heartrateDate}`, {
      headers: { 'Authorization': `Bearer ${ouraToken}` }
    });

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
    
    // Get sleep duration from yesterday's sleep data (the actual night)
    // Try multiple field names and sources
    let sleepDuration = null;
    
    // First try the sleep endpoint (most reliable for duration)
    if (sleepTimeData?.data && sleepTimeData.data.length > 0) {
      const sleepRecord = sleepTimeData.data[0];
      sleepDuration = sleepRecord.total_sleep_duration || 
                      sleepRecord.total_sleep_time || 
                      sleepRecord.duration || 
                      null;
    }
    
    // Fallback to daily_sleep if available
    if (!sleepDuration && sleep) {
      sleepDuration = sleep.total_sleep_duration || 
                      sleep.sleep_duration || 
                      sleep.duration ||
                      null;
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

    // If no sleep/readiness data for today, try yesterday as fallback (data might not be processed yet)
    if (!sleep && !readiness) {
      const fallbackDate = yesterdayDate;
      const fallbackSleepResponse = await fetch(`https://api.ouraring.com/v2/usercollection/daily_sleep?start_date=${fallbackDate}&end_date=${fallbackDate}`, {
        headers: { 'Authorization': `Bearer ${ouraToken}` }
      });
      const fallbackReadinessResponse = await fetch(`https://api.ouraring.com/v2/usercollection/daily_readiness?start_date=${fallbackDate}&end_date=${fallbackDate}`, {
        headers: { 'Authorization': `Bearer ${ouraToken}` }
      });
      
      const fallbackSleepData = fallbackSleepResponse.ok ? await fallbackSleepResponse.json() : null;
      const fallbackReadinessData = fallbackReadinessResponse.ok ? await fallbackReadinessResponse.json() : null;
      
      if (fallbackSleepData?.data?.[0] || fallbackReadinessData?.data?.[0]) {
        // Use fallback data but keep today's activity
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
            sleep: fallbackSleep,
            readiness: fallbackReadiness,
            activity: activity,
            sleepDuration: sleepDuration,
            sleepHours: sleepHours,
            steps: steps,
            lowestRestingHR: lowestRestingHR,
            activeCalories: activeCalories,
            dataDate: fallbackDate,
            activityDate: activityDate,
            note: 'Using yesterday\'s sleep/readiness data (today\'s not yet processed)'
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
        dataDate: todayDate, // Sleep Score and Readiness are always for today
        note: `Sleep/Readiness from ${todayDate} (calculated from last night), Sleep Hours/HR from ${yesterdayDate}`
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
