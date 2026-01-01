// Add this to your existing JavaScript section

let currentMode = 'morning'; // 'morning' or 'evening'
let existingRecordId = null; // Store Airtable record ID for updates

function selectMode(mode) {
    currentMode = mode;
    
    // Update button states
    document.getElementById('morningModeBtn').classList.toggle('active', mode === 'morning');
    document.getElementById('eveningModeBtn').classList.toggle('active', mode === 'evening');
    
    // Update instructions
    const instructionsTitle = document.getElementById('instructionsTitle');
    const instructionsText = document.getElementById('instructionsText');
    const submitButton = document.getElementById('submitButton');
    
    if (mode === 'morning') {
        instructionsTitle.textContent = '🌅 Morning Check-In';
        instructionsText.textContent = 'Fill in how you\'re feeling now. Fields marked optional can be skipped - you can update them later in the evening.';
        submitButton.textContent = 'Get My Plan for Today';
        
        // Make certain fields optional
        document.getElementById('waterIntake').removeAttribute('required');
        document.getElementById('painLevel').removeAttribute('required');
        document.getElementById('dietQuality').removeAttribute('required');
        
        // Add visual indicators
        document.querySelectorAll('.field-optional').forEach(el => {
            el.style.opacity = '0.6';
        });
        
    } else {
        instructionsTitle.textContent = '🌙 Evening Update';
        instructionsText.textContent = 'Update your entry with what actually happened today. This will just save to Airtable without generating new recommendations.';
        submitButton.textContent = 'Save Evening Update';
        
        // Make all fields required for evening
        document.getElementById('waterIntake').setAttribute('required', 'required');
        
        // Remove visual indicators
        document.querySelectorAll('.field-optional').forEach(el => {
            el.style.opacity = '1';
        });
        
        // Update labels to past tense
        document.getElementById('waterLabel').innerHTML = 'Water Intake';
        document.getElementById('dietLabel').innerHTML = 'Diet Quality';
        document.getElementById('exerciseLabel').innerHTML = 'Exercise (select all that apply)';
        document.getElementById('ratingLabel').innerHTML = 'Overall Day Rating';
    }
}

// Modified form submission handler
document.getElementById('healthForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const data = { 
        Date: new Date().toISOString().split('T')[0],
        'Check-In Type': currentMode === 'morning' ? 'Morning' : 'Evening'
    };

    // Get form values
    for (let [key, value] of formData.entries()) {
        if (!key.includes('-') && key !== 'exercise' && key !== 'gi-symptoms' && 
            key !== 'other-symptoms' && key !== 'pain-location') {
            data[key] = value;
        }
    }

    // Get multi-select values
    data['Exercise'] = Array.from(document.querySelectorAll('input[name="exercise"]:checked'))
        .map(cb => cb.value);
    
    data['GI Symptoms'] = Array.from(document.querySelectorAll('input[name="gi-symptoms"]:checked'))
        .map(cb => cb.value);
    
    data['Other Symptoms'] = Array.from(document.querySelectorAll('input[name="other-symptoms"]:checked'))
        .map(cb => cb.value);
    
    data['Pain Location'] = Array.from(document.querySelectorAll('input[name="pain-location"]:checked'))
        .map(cb => cb.value);

    // Add Oura data
    if (ouraData) {
        data['Oura Sleep Score'] = ouraData.sleep?.score;
        data['Oura Sleep Hours'] = ouraData.sleepHours;
        data['Oura Readiness Score'] = ouraData.readiness?.score;
        data['Oura Activity Score'] = ouraData.activity?.score;
        data['Oura Steps'] = ouraData.steps;
        data['Oura Lowest Resting HR'] = ouraData.lowestRestingHR;
        data['Oura Active Calories'] = ouraData.activeCalories;
    }

    // For morning mode, validate only the required rating if not filled
    if (currentMode === 'morning') {
        // Rating is optional in morning mode
    } else {
        // Evening mode requires rating
        if (!data['Overall Day Rating']) {
            alert('Please select an overall day rating for your evening update');
            return;
        }
    }

    if (currentMode === 'morning') {
        await saveAndGetRecommendations(data);
    } else {
        await saveEveningUpdate(data);
    }
});

async function saveAndGetRecommendations(data) {
    const recSection = document.getElementById('recommendationsSection');
    recSection.classList.remove('hidden');
    recSection.innerHTML = '<div class="loading-message"><div class="loading-spinner"></div><br>Saving your morning check-in...</div>';

    document.getElementById('formSection').classList.add('hidden');

    try {
        // Save to Airtable
        const saveResponse = await fetch(`https://api.airtable.com/v0/${config.airtableBaseId}/${encodeURIComponent(config.airtableTableName)}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.airtableToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                records: [{ fields: data }]
            })
        });

        if (!saveResponse.ok) {
            const errorData = await saveResponse.json();
            throw new Error(errorData.error?.message || 'Failed to save to Airtable');
        }

        const savedRecord = await saveResponse.json();
        existingRecordId = savedRecord.records[0].id; // Store for evening update

        recSection.innerHTML = '<div class="success-message">✓ Morning check-in saved!</div>' +
            '<div class="loading-message"><div class="loading-spinner"></div><br>Generating your personalized plan for today...</div>';

        // Get recommendations from Claude
        const recommendationPrompt = `Based on this morning's health check-in data, create a personalized health plan for TODAY.

Morning Check-In Data:
${JSON.stringify(data, null, 2)}

Provide:
1. 2-3 specific, actionable recommendations for TODAY based on their current state:
   - Optimize medication/supplement timing if relevant
   - Specific exercises or movement suggestions based on energy/pain levels
   - Dietary recommendations for today
   - Rest/recovery needs if indicated
   
2. Key things to watch for or monitor throughout the day

3. Positive reinforcement - what they're doing well based on their Oura data and inputs

Keep it warm, encouraging, and practical. Focus on what they can do TODAY to optimize their health. This is a MORNING plan, so frame everything as "today you should..." not "you did well..."`;

        const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 1500,
                messages: [{
                    role: 'user',
                    content: recommendationPrompt
                }]
            })
        });

        const claudeData = await claudeResponse.json();
        
        if (claudeData.content && claudeData.content[0]) {
            const recommendations = claudeData.content[0].text;
            
            recSection.innerHTML = `
                <div class="success-message">✓ Morning check-in saved to Airtable!</div>
                <div class="recommendation-box">
                    <h3>🎯 Your Personalized Plan for Today</h3>
                    <div style="white-space: pre-wrap;">${recommendations}</div>
                </div>
                <button class="new-entry-button" onclick="showEveningUpdateOption()">Update This Entry Tonight</button>
                <button class="new-entry-button" style="margin-top: 10px; background: #667eea;" onclick="location.reload()">Start Fresh Tomorrow</button>
            `;
        } else {
            throw new Error('Could not generate recommendations');
        }
    } catch (error) {
        recSection.innerHTML = `
            <div class="error-message">Error: ${error.message}</div>
            <button class="new-entry-button" onclick="location.reload()">Try Again</button>
        `;
    }
}

async function saveEveningUpdate(data) {
    const recSection = document.getElementById('recommendationsSection');
    recSection.classList.remove('hidden');
    recSection.innerHTML = '<div class="loading-message"><div class="loading-spinner"></div><br>Saving your evening update...</div>';

    document.getElementById('formSection').classList.add('hidden');

    try {
        // Check if we have an existing record from morning
        const today = new Date().toISOString().split('T')[0];
        
        let recordToUpdate = existingRecordId;
        
        // If we don't have a stored record ID, search for today's morning entry
        if (!recordToUpdate) {
            const searchResponse = await fetch(
                `https://api.airtable.com/v0/${config.airtableBaseId}/${encodeURIComponent(config.airtableTableName)}?filterByFormula=AND({Date}='${today}',{Check-In Type}='Morning')`,
                {
                    headers: {
                        'Authorization': `Bearer ${config.airtableToken}`
                    }
                }
            );
            
            if (searchResponse.ok) {
                const searchData = await searchResponse.json();
                if (searchData.records && searchData.records.length > 0) {
                    recordToUpdate = searchData.records[0].id;
                }
            }
        }

        let saveResponse;
        
        if (recordToUpdate) {
            // Update existing morning record
            saveResponse = await fetch(
                `https://api.airtable.com/v0/${config.airtableBaseId}/${encodeURIComponent(config.airtableTableName)}/${recordToUpdate}`,
                {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${config.airtableToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        fields: data
                    })
                }
            );
        } else {
            // Create new evening-only record
            saveResponse = await fetch(
                `https://api.airtable.com/v0/${config.airtableBaseId}/${encodeURIComponent(config.airtableTableName)}`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${config.airtableToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        records: [{ fields: data }]
                    })
                }
            );
        }

        if (!saveResponse.ok) {
            const errorData = await saveResponse.json();
            throw new Error(errorData.error?.message || 'Failed to save to Airtable');
        }

        recSection.innerHTML = `
            <div class="success-message">✓ Evening update saved to Airtable!</div>
            <div style="padding: 30px; text-align: center;">
                <p style="font-size: 18px; margin-bottom: 20px;">Your data has been logged. Great job tracking your health today! 🎉</p>
                <button class="new-entry-button" onclick="location.reload()">Complete Tomorrow's Morning Check-In</button>
            </div>
        `;
    } catch (error) {
        recSection.innerHTML = `
            <div class="error-message">Error: ${error.message}</div>
            <button class="new-entry-button" onclick="location.reload()">Try Again</button>
        `;
    }
}

function showEveningUpdateOption() {
    document.getElementById('recommendationsSection').classList.add('hidden');
    document.getElementById('formSection').classList.remove('hidden');
    
    // Switch to evening mode
    selectMode('evening');
    
    // Scroll to top of form
    document.getElementById('formSection').scrollIntoView({ behavior: 'smooth' });
}
