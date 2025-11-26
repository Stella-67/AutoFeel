# Quick Start Guide - Application Form Auto-Fill Extension

Get up and running in 5 minutes!

## Step 1: Get Your API Key (2 min)

Choose **ONE** of the following:

### Option A: OpenAI (GPT-4) ⭐ Recommended
1. Go to https://platform.openai.com/api-keys
2. Sign up or log in
3. Click "Create new secret key"
4. Copy the key (you won't see it again!)
5. Save it somewhere safe

**Cost:** ~$0.03 per generated answer (varies)

### Option B: Anthropic (Claude)
1. Go to https://console.anthropic.com/
2. Sign up or log in
3. Go to API keys section
4. Create a new key
5. Copy and save it

**Cost:** ~$0.01 per generated answer (varies)

## Step 2: Load Extension (2 min)

### On Windows/Mac/Linux:

1. Open Chrome and go to: `chrome://extensions/`

2. Toggle **Developer mode** (top right corner)

3. Click **Load unpacked**

4. Navigate to: `/home/sl3348/project/Agentic`

5. Click **Select Folder**

✅ You should now see "Application Form Auto-Fill" in your extensions!

## Step 3: Configure Settings (1 min)

1. Click the extension icon in your Chrome toolbar (puzzle piece icon)

2. Go to **Settings** tab

3. Paste your API key in the "API Key" field

4. Choose your model:
   - OpenAI: `gpt-4`
   - Anthropic: `claude-3-sonnet-20240229`

5. Click **Save LLM Settings**

## Step 4: Build Your Profile (Optional, but recommended)

Click **My Profile** tab and fill in:

- Personal info (name, email, location)
- Education (school, degree, graduation year)
- Experience (previous jobs and achievements)
- Skills (what you're good at)
- Stories (examples of your accomplishments)

The more detail you provide, the better the AI generates answers!

**Quick template:**

```
Name: Jane Doe
Email: jane@example.com
Summary: Software engineer with 3+ years of experience in web development

Education:
- Bachelor of Science in Computer Science
- UC Berkeley, 2020
- Relevant coursework: Algorithms, Web Development, Databases

Experience:
- Software Engineer at Google (2021-2023)
  - Led development of 3 web services
  - Improved performance by 30%

Skills:
- Python (Expert)
- React (Advanced)
- AWS (Intermediate)

Stories:
- Led successful API redesign that reduced latency from 500ms to 50ms
- Mentored 2 junior engineers through their first 6 months
```

## Step 5: Try It Out!

### Test with a Real Form

1. Go to any application form (try LinkedIn, Workday, or a test form)

2. Click the extension icon

3. Click **"Detect Form Fields"**
   - You should see all the questions found!

4. For each question, click **"Generate Answer"**
   - The AI will create a personalized response

5. Review the answer and click **"Fill Field"**
   - The form field will be filled automatically!

6. Submit the form (you do this manually)

### Test Form (No Real Application)

If you want to test without submitting a real application:

1. Create a simple HTML file with form fields:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Test Form</title>
</head>
<body>
  <h1>Test Application Form</h1>

  <label>Tell us about yourself:</label>
  <textarea name="about_you" placeholder="Enter your response"></textarea>

  <label>Why do you want this position?</label>
  <textarea name="motivation" placeholder="Enter your response"></textarea>

  <label>Describe a challenge you've overcome:</label>
  <textarea name="challenge" placeholder="Enter your response"></textarea>

  <button type="submit">Submit</button>
</body>
</html>
```

2. Save this as `test-form.html`

3. Open it in Chrome (`File` → `Open`)

4. Click the extension and test it out!

## Troubleshooting

### "Extension not loading"
- Make sure Developer Mode is ON in `chrome://extensions/`
- Check that you selected the correct folder
- Try clicking the extension icon - if not visible, click the puzzle icon in toolbar

### "API key error"
- Double-check you copied the full key
- Make sure you pasted it in Settings, not elsewhere
- Verify the key is active in your API account
- Try generating a new key

### "No forms detected"
- Click "Detect Form Fields" again
- Some websites use special form libraries - try a different site
- Check browser console for errors (F12)

### "Generated answer is short/bad"
- Add more detail to your profile
- Try adjusting the answer length in Settings
- Make sure your profile has specific examples, not generic statements

### "Extension disappeared from toolbar"
- Click the puzzle icon in Chrome toolbar
- Click the eye icon next to "Application Form Auto-Fill"

## Tips for Best Results

1. **Fill your profile completely**
   - More detail = better generated answers
   - Include quantifiable results (40% improvement, 5+ years, etc.)
   - Add 2-3 example stories

2. **Customize for the application**
   - Before generating, adjust tone/length in Settings
   - Use "professional" tone for corporate jobs
   - Use "conversational" tone for startups

3. **Review before submitting**
   - Always read the generated answer
   - Customize if needed to match the role better
   - Ensure it's truthful and represents you well

4. **Different answers for different roles**
   - For each role, you can adjust the tone and focus
   - The LLM will highlight different achievements based on context

5. **Privacy reminder**
   - Your profile stays on your computer
   - Only the question is sent to OpenAI/Anthropic
   - API calls are encrypted

## Next Steps

- **Read full documentation:** See `README.md` for advanced features
- **Data management:** Use Export/Import in Settings to back up your profile
- **Custom stories:** Add specific stories for different types of roles
- **Multiple profiles:** Create different profiles for different applications (coming soon!)

## Common Questions

**Q: Is my data safe?**
A: Yes! Your profile is stored locally. Only the question and a summary are sent to the LLM API.

**Q: Can I use this on any website?**
A: It works on most sites. Some with complex form libraries may require manual filling.

**Q: How much does it cost?**
A: Depends on your API. OpenAI charges ~$0.03/answer, Claude ~$0.01/answer. No hidden fees.

**Q: Can I turn it off for certain websites?**
A: Currently, it's active on all sites. You can manually disable it from Chrome extensions page.

**Q: What if the AI answer is wrong?**
A: Always review before submitting! Edit the answer in the popup if needed.

**Q: Can I use this on my phone?**
A: Not yet - Chrome extensions don't work on mobile. Coming soon!

## Support

Having issues? Check:
1. README.md - Detailed troubleshooting section
2. DATA_STRUCTURES.md - Technical details
3. Browser console (F12) - Error messages

---

You're all set! Good luck with your applications! 🚀
