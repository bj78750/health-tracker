# 🏥 Daily Health Check-In App

A personalized health tracking application that combines **Oura Ring data** with manual health inputs to generate **AI-powered daily recommendations** using Claude AI.

## 🌟 Overview

This web application helps you track your daily health metrics and receive personalized guidance for optimizing your wellbeing. It features a two-phase check-in system that adapts to your morning and evening routines.

### Key Features

- **🌅 Morning Check-In** - Start your day with Oura data and get a personalized plan
- **🌙 Evening Update** - Log what actually happened and update your records
- **📱 Oura Ring Integration** - Automatically fetches sleep, readiness, activity, and heart rate data
- **🤖 AI-Powered Recommendations** - Claude AI generates personalized health plans
- **📊 Airtable Storage** - All data saved to Airtable for long-term tracking and analysis
- **🎯 Smart Form Validation** - Fields adapt based on time of day (morning vs evening)

## 📸 Screenshots

### Morning Check-In
- View your Oura Ring data from last night
- Fill in how you're feeling right now
- Get AI-generated plan for the day

### Evening Update
- Update your entry with what actually happened
- Track water intake, exercise, diet quality
- Save without generating new recommendations

## 🚀 Getting Started

### Prerequisites

- **Airtable Account** - For data storage
  - Create an Airtable base with a table called "Daily Logs"
  - Generate a Personal Access Token at [airtable.com/create/tokens](https://airtable.com/create/tokens)
  
- **Oura Ring** (Optional) - For automatic health data
  - Get API token at [cloud.ouraring.com/personal-access-tokens](https://cloud.ouraring.com/personal-access-tokens)

- **Netlify Account** - For hosting the serverless functions
  - Fork this repository
  - Connect to Netlify for automatic deployment

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/health-tracker-app.git
   cd health-tracker-app
   ```

2. **Deploy to Netlify**
   - Connect your GitHub repository to Netlify
   - Netlify will automatically detect the `netlify.toml` configuration
   - Deploy!

3. **Configure the App**
   - Open the deployed app URL
   - Enter your Airtable credentials:
     - Personal Access Token
     - Base ID (from your Airtable URL: `appXXXXXXXXXXXXXX`)
     - Table Name (default: "Daily Logs")
   - (Optional) Enter your Oura API token

## 📋 Airtable Schema

Create these fields in your Airtable "Daily Logs" table:

### Core Fields
- `Date` - Date
- `Check-In Type` - Single Select (Morning, Evening)

### Mood & Energy
- `Mood` - Single Select
- `Energy Level` - Single Select
- `Sleep Quality` - Single Select

### Physical Health
- `Pain Level` - Single Select
- `Pain Location` - Multiple Select
- `GI Symptoms` - Multiple Select
- `Other Symptoms` - Multiple Select

### Lifestyle
- `Appetite` - Single Select
- `Water Intake` - Single Select
- `Stress Level` - Single Select
- `Diet Quality` - Single Select
- `Exercise` - Multiple Select
- `Weight` - Number

### Oura Data (Auto-populated)
- `Oura Sleep Score` - Number
- `Oura Sleep Hours` - Number
- `Oura Readiness Score` - Number
- `Oura Activity Score` - Number
- `Oura Steps` - Number
- `Oura Lowest Resting HR` - Number
- `Oura Active Calories` - Number

### Notes
- `Medications Taken` - Long Text
- `Supplements Taken` - Long Text
- `Notes` - Long Text
- `Overall Day Rating` - Number (1-5)

## 🛠️ Technical Architecture

### Frontend
- **Pure HTML/CSS/JavaScript** - No build process required
- **Responsive Design** - Works on desktop and mobile
- **Client-side form validation**
- **Dynamic UI** - Changes based on morning/evening mode

### Backend (Serverless)
- **Netlify Functions** - Serverless backend for API calls
- **Oura API Integration** - Fetches comprehensive health data
  - Daily Sleep scores
  - Daily Readiness scores
  - Daily Activity metrics
  - Heart Rate data (for resting HR)
  - Sleep duration details
- **CORS Handling** - Proxy to avoid browser CORS issues

### AI Integration
- **Claude API** - Anthropic's Claude Sonnet 4 model
- **Context-aware prompts** - Different prompts for morning vs evening
- **Personalized recommendations** - Based on Oura data + manual inputs

### Data Storage
- **Airtable** - Cloud-based database
- **Record Linking** - Evening updates merge with morning entries
- **Searchable History** - Track trends over time

## 🔧 Configuration

### Environment Variables (Optional)
You can set environment variables in Netlify for production:

```
OURA_TOKEN=your_default_token_here
AIRTABLE_TOKEN=your_default_token_here
AIRTABLE_BASE_ID=your_base_id_here
```

If set, users won't need to enter these values (useful for personal use).

### netlify.toml
The included `netlify.toml` configures:
- Functions directory: `netlify/functions`
- Build settings (none required for static site)

## 📱 How to Use

### Morning Workflow

1. **Open the app** in your browser
2. **Start Daily Check-In** with your credentials
3. **View your Oura data** automatically loaded from last night
4. **Select "Morning Check-In" mode** (default)
5. **Fill in required fields**:
   - Mood and energy level
   - Sleep quality from last night
   - Current appetite and stress level
6. **Skip optional fields** (water, exercise, diet - you haven't done these yet!)
7. **Click "Get My Plan for Today"**
8. **Receive AI-generated personalized plan**
   - Specific action items for today
   - Things to monitor
   - Positive reinforcement

### Evening Workflow

#### Option A: Update Morning Entry
1. **Click "Update This Entry Tonight"** from morning recommendations
2. **Form switches to Evening Update mode**
3. **Fill in what actually happened**:
   - Water intake (now required)
   - Exercise completed
   - Diet quality
   - Overall day rating (now required)
4. **Click "Save Evening Update"**
5. **Confirmation shown** - No new AI recommendations
6. Data merges with your morning entry in Airtable

#### Option B: Evening-Only Entry
1. **Return to app in evening** without morning check-in
2. **Select "Evening Update" mode**
3. **Fill in complete form**
4. **Save** - Creates new evening-only record

## 🎯 Features in Detail

### Oura Ring Integration

The app fetches comprehensive data from Oura API v2:

**Daily Sleep** (`/v2/usercollection/daily_sleep`)
- Sleep score
- Sleep contributors (deep, REM, efficiency, latency, etc.)

**Daily Readiness** (`/v2/usercollection/daily_readiness`)
- Readiness score
- Recovery indicators

**Daily Activity** (`/v2/usercollection/daily_activity`)
- Activity score
- Steps
- Active calories
- Total calories

**Sleep Duration** (`/v2/usercollection/sleep`)
- Total sleep duration in seconds
- Converted to hours for display

**Heart Rate** (`/v2/usercollection/heartrate`)
- Processes all readings to find lowest resting HR
- Filters for sleep/rest sources only

### Smart Mode Switching

**Morning Mode:**
- Minimal required fields
- Optional fields visually dimmed with "(Optional for morning)" label
- Submit button: "Get My Plan for Today"
- AI generates forward-looking recommendations

**Evening Mode:**
- More fields become required (water, overall rating)
- All labels updated to reflect completed activities
- Submit button: "Save Evening Update"
- No AI recommendations, just saves data

### AI Recommendation Engine

**Morning Prompt Focus:**
- Analyzes current state (Oura data + inputs)
- Creates actionable plan for TODAY
- Forward-looking language ("you should...", "today try...")
- Specific timing recommendations (medication, supplements, meals)

**Evening Prompt:** N/A - Evening mode only saves data

## 🔐 Security & Privacy

- **Client-side credentials** - Tokens stored in browser session only
- **No server-side storage** - All data goes directly to your Airtable
- **Serverless functions** - Proxy API calls to avoid exposing tokens
- **HTTPS required** - Netlify provides SSL certificates
- **Personal use focused** - Not designed for multi-tenant usage

⚠️ **Important**: Never commit API tokens to your repository. Use environment variables or enter at runtime.

## 🐛 Troubleshooting

### Oura Data Not Loading

**Issue**: Returns `null` for activity or sleep duration

**Solutions:**
1. Check the date - Oura may not have processed today's data yet
2. Verify your Oura token is valid at [cloud.ouraring.com](https://cloud.ouraring.com)
3. Check Netlify function logs for API errors
4. Ensure you have recent Oura data (wear your ring!)

### Airtable Save Fails

**Issue**: "Failed to save to Airtable" error

**Solutions:**
1. Verify your Airtable token has write permissions
2. Check Base ID matches your Airtable URL
3. Ensure table name matches exactly (case-sensitive)
4. Verify all field names in Airtable match the schema above

### Evening Update Creates Duplicate

**Issue**: Evening update doesn't merge with morning entry

**Solutions:**
1. Verify `Check-In Type` field exists in Airtable (Single Select)
2. Check field name is exactly "Check-In Type" (case-sensitive)
3. Ensure morning entry has "Morning" value in Check-In Type field

### Missing AI Recommendations

**Issue**: Recommendations not generating

**Solutions:**
1. Check Claude API availability (using built-in Claude API in artifacts)
2. Verify internet connection
3. Check browser console for errors
4. Ensure all required fields are filled

## 📊 Data Analysis

Your Airtable base becomes a rich dataset for health tracking:

- **Trends over time** - Compare Oura scores week-over-week
- **Correlations** - See how sleep affects mood and energy
- **Intervention effectiveness** - Track changes after new habits
- **Export options** - Airtable supports CSV export for external analysis

### Suggested Airtable Views

1. **Daily Timeline** - Chronological view of all entries
2. **Morning Plans** - Filter where Check-In Type = "Morning"
3. **Complete Days** - Filter where Check-In Type = "Evening" (merged records)
4. **Low Energy Days** - Filter for Energy Level = "Very Low" or "Low"
5. **High Pain Days** - Filter for Pain Level != "None"

## 🔄 Updates & Enhancements

### Recently Added
- ✅ Morning/Evening mode switching
- ✅ Enhanced Oura integration (heart rate, sleep hours)
- ✅ Smart field validation
- ✅ Record merging for updates

### Roadmap Ideas
- [ ] Weekly summary reports
- [ ] Trend visualization charts
- [ ] Mobile app wrapper (React Native or similar)
- [ ] Notification reminders for evening updates
- [ ] Export morning plans to calendar
- [ ] Multiple user support
- [ ] Historical trend analysis in UI
- [ ] Integration with other health apps (Apple Health, Google Fit)

## 🤝 Contributing

This is a personal health tracking tool, but contributions are welcome!

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🙏 Acknowledgments

- **Anthropic** - Claude AI for personalized recommendations
- **Oura** - Comprehensive health tracking hardware and API
- **Airtable** - Flexible database for health data storage
- **Netlify** - Serverless hosting and deployment platform

## 📞 Support

For issues or questions:
1. Check the [Troubleshooting](#-troubleshooting) section
2. Review [closed issues](https://github.com/yourusername/health-tracker-app/issues?q=is%3Aissue+is%3Aclosed)
3. Open a [new issue](https://github.com/yourusername/health-tracker-app/issues/new)

## 📚 Additional Documentation

- [Oura API Solution Guide](SOLUTION_GUIDE.md) - Fixes for missing Oura data
- [Morning/Evening Mode Guide](MORNING_EVENING_MODE_GUIDE.md) - Implementation details for two-phase check-ins
- [Netlify Functions Documentation](https://docs.netlify.com/functions/overview/)
- [Airtable API Documentation](https://airtable.com/developers/web/api/introduction)
- [Oura API Documentation](https://cloud.ouraring.com/v2/docs)

---

**Built with ❤️ for personal health optimization**

*Stay healthy, track consistently, and let AI guide your wellness journey!* 🌟
