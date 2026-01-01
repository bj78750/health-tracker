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
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Get the Oura token and date from the request
    const { ouraToken, date } = JSON.parse(event.body);

    if (!ouraToken) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Oura token is required' })
      };
    }

    // Use today's date if not provided
    const targetDate = date || new Date().toISOString().split('T')[0];

    // Fetch data from all three Oura endpoints in parallel
    const [sleepResponse, readinessResponse, activityResponse] = await Promise.all([
      fetch(`https://api.ouraring.com/v2/usercollection/daily_sleep?start_date=${targetDate}&end_date=${targetDate}`, {
        headers: { 'Authorization': `Bearer ${ouraToken}` }
      }),
      fetch(`https://api.ouraring.com/v2/usercollection/daily_readiness?start_date=${targetDate}&end_date=${targetDate}`, {
        headers: { 'Authorization': `Bearer ${ouraToken}` }
      }),
      fetch(`https://api.ouraring.com/v2/usercollection/daily_activity?start_date=${targetDate}&end_date=${targetDate}`, {
        headers: { 'Authorization': `Bearer ${ouraToken}` }
      })
    ]);

    // Parse responses
    const sleepData = sleepResponse.ok ? await sleepResponse.json() : null;
    const readinessData = readinessResponse.ok ? await readinessResponse.json() : null;
    const activityData = activityResponse.ok ? await activityResponse.json() : null;

    // Check if any data was found
    const hasData = (sleepData?.data?.length > 0) || 
                    (readinessData?.data?.length > 0) || 
                    (activityData?.data?.length > 0);

    // If no data for today, try yesterday
    if (!hasData) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayDate = yesterday.toISOString().split('T')[0];

      const [sleepYesterday, readinessYesterday, activityYesterday] = await Promise.all([
        fetch(`https://api.ouraring.com/v2/usercollection/daily_sleep?start_date=${yesterdayDate}&end_date=${yesterdayDate}`, {
          headers: { 'Authorization': `Bearer ${ouraToken}` }
        }),
        fetch(`https://api.ouraring.com/v2/usercollection/daily_readiness?start_date=${yesterdayDate}&end_date=${yesterdayDate}`, {
          headers: { 'Authorization': `Bearer ${ouraToken}` }
        }),
        fetch(`https://api.ouraring.com/v2/usercollection/daily_activity?start_date=${yesterdayDate}&end_date=${yesterdayDate}`, {
          headers: { 'Authorization': `Bearer ${ouraToken}` }
        })
      ]);

      const sleepYesterdayData = sleepYesterday.ok ? await sleepYesterday.json() : null;
      const readinessYesterdayData = readinessYesterday.ok ? await readinessYesterday.json() : null;
      const activityYesterdayData = activityYesterday.ok ? await activityYesterday.json() : null;

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type'
        },
        body: JSON.stringify({
          sleep: sleepYesterdayData?.data?.[0] || null,
          readiness: readinessYesterdayData?.data?.[0] || null,
          activity: activityYesterdayData?.data?.[0] || null,
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
        sleep: sleepData?.data?.[0] || null,
        readiness: readinessData?.data?.[0] || null,
        activity: activityData?.data?.[0] || null,
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