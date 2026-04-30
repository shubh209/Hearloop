# Hearloop — LinkedIn Connection Notes by Role

---

## The Core Message (Why This Project)

Customers ignore forms but will speak for 5 seconds. Hearloop replaces surveys with a tap-and-speak button. 5 seconds of voice becomes structured business insights instantly.

---

## General Connection Note (300 chars)

```
Hi [Name], built Hearloop after noticing customers skip surveys but talk freely. So I made a 5-sec voice feedback API — businesses embed it, customers tap & speak, they get instant AI insights. Would love to connect!
```

--

## Role-Specific Notes

### CTO

```
Hi [Name], built Hearloop — a voice feedback infrastructure API after seeing survey completion rates below 5%. Customers won't type but will speak for 5 seconds. Engineered the full stack: multi-tenant API, async AI pipeline on AWS, embeddable JS widget. Would love to connect!
```

### VP Engineering

```
Hi [Name], built Hearloop to solve low survey completion — a 5-sec voice feedback API business esembed in their app. Interesting engineering: BullMQ job pipeline, Groq Whisper STT, AWSBedrock classification, EC2/RDS/S3 deployment. Would love to connect!
```

### Head of Product

```
Hi [Name], I built Hearloop after one insight — customers ignore forms but talk freely. So I replaced surveys with a tap-and-speak button. 5 seconds of voice becomes structured business insights instantly. Built the full product from widget to AI pipeline. Would love to connect!
```

### Head of AI / ML

```
Hi [Name], built Hearloop — a voice-to-insight pipeline using Groq Whisper for STT and AWS Bedrock Nova Lite for classification. Chose Nova Lite over Claude for 7x cost reduction on structured JSON tasks. Fallback to Haiku on parse errors. Would love to connect!
```

### Senior Software Engineer

```
Hi [Name], built Hearloop — hit a nasty BullMQ bug where workers completed jobs without running handlers. All workers shared one queue, job.name filter was racing. Fixed with dedicated queues per job type. Full AWS deployment. Would love to connect!
```

### Technical Recruiter

```
Hi [Name], instead of sending a resume cold I wanted to share something I built — Hearloop, a voice feedback API fully deployed on AWS. Multi-tenant REST API, async AI pipeline, React widget on Vercel. Open to backend and AI engineering roles. Would love to connect for future opportunities!
```

---

## Why Each Is Different


| Role                | They care about            | Lead with                     |
| ------------------- | -------------------------- | ----------------------------- |
| CTO                 | Vision + scalability       | The problem + business angle  |
| VP Engineering      | System design + delivery   | Architecture decisions        |
| Head of Product     | User insight + problem fit | The customer insight          |
| Head of AI/ML       | Model choices + cost       | Technical AI decisions        |
| Senior Engineer     | Real bugs + solutions      | A specific hard problem       |
| Technical Recruiter | Skills + deployments       | What you built + availability |


---

## After They Connect — Follow Up by Role

### CTO / VP Engineering (Day 1)

```
Hey [Name], thanks for connecting!

I built Hearloop — a voice feedback infrastructure 
API. The problem: survey completion rates are below 
5% for most businesses. Customers won't fill forms 
but they'll speak for 5 seconds.

The system converts voice clips into structured 
insights (sentiment, topics, urgency) via an async 
AI pipeline on AWS. Businesses embed a JS widget 
and receive results via webhook.

Happy to share the GitHub if the architecture 
is interesting to you.
```

### Head of Product (Day 1)

```
Hey [Name], thanks for connecting!

Built Hearloop after one customer insight — people 
skip surveys because they're effortful. But ask 
someone to speak for 5 seconds and they will.

Hearloop is the infrastructure layer for that. 
Businesses embed a button, customers tap and speak, 
the business gets structured insights instantly.

Would love to hear your thoughts on the product 
angle if you have a few minutes.
```

### Senior Engineer (Day 1)

```
Hey [Name], thanks for connecting!

Building Hearloop — ran into an interesting 
BullMQ issue where workers were completing 
jobs without executing handlers.

Root cause: all workers shared one queue and 
filtered by job.name. The filter was passing 
but BullMQ was marking jobs complete on early 
return. Fixed it with dedicated queues per 
job type.

GitHub here if you want to dig into the 
architecture: [link]
```

### Technical Recruiter (Day 1)

```
Hey [Name], thanks for connecting!

I'm actively looking for backend or AI engineering 
roles. Here's what I recently shipped:

Hearloop — a voice feedback API fully deployed 
on AWS. Multi-tenant Fastify API, BullMQ async 
pipeline, Groq Whisper STT, AWS Bedrock for 
classification, Docker on EC2, Next.js on Vercel.

Resume: [link]
GitHub: [link]
Live: hearloop.vercel.app

Happy to chat if anything looks relevant to 
your current openings.
```

---

## Golden Rules

**First note:** Lead with the problem, not the solution. Lead with the insight, not the tech stack.

**After connecting:** One message, one ask. Don't ask for a job, feedback, AND a referral in one message.

**Technical conversations:** Share one specific hard problem you solved. Engineers respect debuggers more than builders.

**Response rate tip:** Personalize the first line per person. Reference their company, their recent post, or their role specifically.

---

## Key Links to Always Have Ready

- Live product: [https://hearloop.vercel.app](https://hearloop.vercel.app)
- GitHub: [https://github.com/shubh209/Hearloop](https://github.com/shubh209/Hearloop)
- API health: [http://18.189.188.126:3001/health](http://18.189.188.126:3001/health)

