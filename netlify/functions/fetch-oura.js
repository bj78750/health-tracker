// netlify/functions/fetch-oura.js
// Serverless function to fetch Oura data without CORS issues

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
    // Get the Oura token and date from the request
    const { ouraToken, date } = JSON.parse(event.body);

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

    // Use today's date if not provided
    const targetDate = date || new Date().toISOString().split('T')[0];

    // Fetch data from all Oura endpoints in parallel
    const [sleepResponse, readinessResponse, activityResponse, sleepTimeResponse, heartrateResponse] = await Promise.all([
      fetch(`https://api.ouraring.com/v2/usercollection/daily_sleep?start_date=${targetDate}&end_date=${targetDate}`, {
        headers: { 'Authorization': `Bearer ${ouraToken}` }
      }),
      fetch(`https://api.ouraring.com/v2/usercollection/daily_readiness?start_date=${targetDate}&end_date=${targetDate}`, {
        headers: { 'Authorization': `Bearer ${ouraToken}` }
      }),
      fetch(`https://api.ouraring.com/v2/usercollection/daily_activity?start_date=${targetDate}&end_date=${targetDate}`, {
        headers: { 'Authorization': `Bearer ${ouraToken}` }
      }),
      fetch(`https://api.ouraring.com/v2/usercollection/sleep?start_date=${targetDate}&end_date=${targetDate}`, {
        headers: { 'Authorization': `Bearer ${ouraToken}` }
      }),
      fetch(`https://api.ouraring.com/v2/usercollection/heartrate?start_date=${targetDate}&end_date=${targetDate}`, {
        headers: { 'Authorization': `Bearer ${ouraToken}` }
      })
    ]);

    // Parse responses
    const sleepData = sleepResponse.ok ? await sleepResponse.json() : null;
    const readinessData = readinessResponse.ok ? await readinessResponse.json() : null;
    const activityData = activityResponse.ok ? await activityResponse.json() : null;
    const sleepTimeData = sleepTimeResponse.ok ? await sleepTimeResponse.json() : null;
    const heartrateData = heartrateResponse.ok ? await heartrateResponse.json() : null;

    // Extract and process data
    const sleep = sleepData?.data?.[0] || null;
    const readiness = readinessData?.data?.[0] || null;
    const activity = activityData?.data?.[0] || null;
    const sleepDuration = sleepTimeData?.data?.[0]?.total_sleep_duration || null;
    
    // Convert sleep duration from seconds to hours (rounded to 1 decimal)
    const sleepHours = sleepDuration ? (sleepDuration / 3600).toFixed(1) : null;
    
    // Extract activity metrics
    const steps = activity?.steps || null;
    const activeCalories = activity?.active_calories || null;
    
    // Process heart rate data to find lowest resting HR
    let lowestRestingHR = null;
    if (heartrateData?.data && heartrateData.data.length > 0) {
      // Filter for sleep/rest sources and find minimum
      const restingReadings = heartrateData.data
        .filter(reading => reading.source === 'sleep' || reading.source === 'rest')
        .map(reading => reading.bpm)
        .filter(bpm => bpm != null);
      
      if (restingReadings.length > 0) {
        lowestRestingHR = Math.min(...restingReadings);
      }
    }

    // Check if any data was found
    const hasData = (sleepData?.data?.length > 0) || 
                    (readinessData?.data?.length > 0) || 
                    (activityData?.data?.length > 0) ||
                    (sleepTimeData?.data?.length > 0);

    // If no data for today, try yesterday
    if (!hasData) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayDate = yesterday.toISOString().split('T')[0];

      const [sleepYesterday, readinessYesterday, activityYesterday, sleepTimeYesterday, heartrateYesterday] = await Promise.all([
        fetch(`https://api.ouraring.com/v2/usercollection/daily_sleep?start_date=${yesterdayDate}&end_date=${yesterdayDate}`, {
          headers: { 'Authorization': `Bearer ${ouraToken}` }
        }),
        fetch(`https://api.ouraring.com/v2/usercollection/daily_readiness?start_date=${yesterdayDate}&end_date=${yesterdayDate}`, {
          headers: { 'Authorization': `Bearer ${ouraToken}` }
        }),
        fetch(`https://api.ouraring.com/v2/usercollection/daily_activity?start_date=${yesterdayDate}&end_date=${yesterdayDate}`, {
          headers: { 'Authorization': `Bearer ${ouraToken}` }
        }),
        fetch(`https://api.ouraring.com/v2/usercollection/sleep?start_date=${yesterdayDate}&end_date=${yesterdayDate}`, {
          headers: { 'Authorization': `Bearer ${ouraToken}` }
        }),
        fetch(`https://api.ouraring.com/v2/usercollection/heartrate?start_date=${yesterdayDate}&end_date=${yesterdayDate}`, {
          headers: { 'Authorization': `Bearer ${ouraToken}` }
        })
      ]);

      const sleepYesterdayData = sleepYesterday.ok ? await sleepYesterday.json() : null;
      const readinessYesterdayData = readinessYesterday.ok ? await readinessYesterday.json() : null;
      const activityYesterdayData = activityYesterday.ok ? await activityYesterday.json() : null;
      const sleepTimeYesterdayData = sleepTimeYesterday.ok ? await sleepTimeYesterday.json() : null;
      const heartrateYesterdayData = heartrateYesterday.ok ? await heartrateYesterday.json() : null;

      // Process yesterday's data
      const yesterdaySleep = sleepYesterdayData?.data?.[0] || null;
      const yesterdayReadiness = readinessYesterdayData?.data?.[0] || null;
      const yesterdayActivity = activityYesterdayData?.data?.[0] || null;
      const yesterdaySleepDuration = sleepTimeYesterdayData?.data?.[0]?.total_sleep_duration || null;
      const yesterdaySleepHours = yesterdaySleepDuration ? (yesterdaySleepDuration / 3600).toFixed(1) : null;
      const yesterdaySteps = yesterdayActivity?.steps || null;
      const yesterdayActiveCalories = yesterdayActivity?.active_calories || null;
      
      // Process yesterday's heart rate
      let yesterdayLowestHR = null;
      if (heartrateYesterdayData?.data && heartrateYesterdayData.data.length > 0) {
        const restingReadings = heartrateYesterdayData.data
          .filter(reading => reading.source === 'sleep' || reading.source === 'rest')
          .map(reading => reading.bpm)
          .filter(bpm => bpm != null);
        
        if (restingReadings.length > 0) {
          yesterdayLowestHR = Math.min(...restingReadings);
        }
      }

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type'
        },
        body: JSON.stringify({
          sleep: yesterdaySleep,
          readiness: yesterdayReadiness,
          activity: yesterdayActivity,
          sleepDuration: yesterdaySleepDuration,
          sleepHours: yesterdaySleepHours,
          steps: yesterdaySteps,
          lowestRestingHR: yesterdayLowestHR,
          activeCalories: yesterdayActiveCalories,
          dataDate: yesterdayDate,
          note: 'Using yesterday\'s data (today not yet available)'
        })
      };
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
        dataDate: targetDate
      })
    };

  } catch (error) {
    console.error('Error fetching Oura data:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        error: 'Failed to fetch Oura data',
        message: error.message 
      })
    };
  }
};
