# VoicePay

A secure, multi-modal biometric authentication and payment platform that leverages voice verification, facial recognition, and advanced NLP to provide seamless and secure financial transactions.

## 🎯 Features

### 🔐 Authentication & Security
- **Voice-Based Authentication** - Secure voice recognition and verification
- **Facial Recognition** - Real-time face detection and recognition using advanced ML models
- **Biometric Enrollment** - Easy enrollment process for voice and facial data
- **JWT Authentication** - Secure token-based authentication system
- **Multi-factor Verification** - Combines voice and facial biometrics for enhanced security

### 💳 Payment Processing
- **Voice-Activated Payments** - Complete payments using voice commands
- **Real-time Verification** - Instant voice and facial verification before transactions
- **Secure Payment Routes** - Protected API endpoints for payment handling
- **Transaction History** - Detailed analytics and transaction records

### 🗣️ Speech & NLP
- **Speech Recognition** - Real-time speech-to-text conversion
- **Natural Language Processing** - NLP-based intent detection and processing
- **Text-to-Speech** - Audio feedback and account information delivery
- **Speech Analytics** - Advanced analytics on voice patterns and user interactions

### 📊 Analytics & Monitoring
- **User Analytics** - Detailed user activity tracking
- **Security Analytics** - Monitor and analyze authentication patterns
- **Performance Metrics** - Real-time system performance monitoring

## 🚀 Quick Start

### Prerequisites
- Node.js (v16 or higher)
- MongoDB
- Hugging Face API Token (for TTS features)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/ChanikyaSaiL/VoicePay.git
cd VoicePay
```

2. **Install frontend dependencies**
```bash
npm install
```

3. **Install server dependencies**
```bash
cd server
npm install
cd ..
```

4. **Configure environment variables**
```bash
# Create .env file in server directory
cp server/.env.example server/.env

# Update the following variables:
# - MONGODB_URI: Your MongoDB connection string
# - JWT_SECRET: Your JWT secret key
# - HF_ACCESS_TOKEN: Your Hugging Face API token
# - PORT: Server port (default: 5005)
```

### Running the Application

**Development Mode:**
```bash
# Terminal 1: Start the frontend (Vite)
npm run dev

# Terminal 2: Start the backend server
cd server && npm start
```

**Production Build:**
```bash
npm run build
cd server && npm start
```

## 📁 Project Structure

```
VoicePay/
├── src/                          # Frontend React application
│   ├── components/               # React components
│   │   ├── Layout.jsx           # Main layout component
│   │   └── VoiceOverlay.jsx    # Voice interface overlay
│   ├── pages/                   # Page components
│   │   ├── Auth.jsx             # Authentication page
│   │   ├── Enrollment.jsx       # User enrollment page
│   │   ├── PaymentAuth.jsx      # Payment verification
│   │   ├── Analytics.jsx        # Analytics dashboard
│   │   ├── Home.jsx             # Home page
│   │   └── Setup.jsx            # Initial setup
│   ├── context/                 # React Context
│   │   └── AuthContext.jsx      # Authentication context
│   ├── hooks/                   # Custom React hooks
│   │   └── useSpeechRecognition.js # Speech recognition hook
│   ├── utils/                   # Utility functions
│   │   ├── nlp.js              # NLP processing
│   │   ├── nlpAnalytics.js     # NLP analytics
│   │   └── tts.js              # Text-to-speech
│   ├── App.jsx                  # Main App component
│   └── main.jsx                 # React entry point
├── server/                       # Backend Node.js/Express server
│   ├── routes/                  # API routes
│   │   ├── auth.js              # Authentication endpoints
│   │   ├── payment.js           # Payment processing
│   │   ├── speech.js            # Speech processing
│   │   ├── verify.js            # Verification endpoints
│   │   └── voiceVerify.js       # Voice verification logic
│   ├── models/                  # Database models
│   │   └── User.js              # User model
│   ├── uploads/                 # User voice/biometric data
│   ├── server.js                # Express server setup
│   └── package.json
├── public/                       # Static assets
│   └── models/                  # Pre-trained ML models
│       ├── tiny_face_detector_model
│       ├── face_landmark_68_model
│       └── face_recognition_model
└── package.json                 # Frontend dependencies
```

## 🛠️ Technology Stack

### Frontend
- **React** - UI framework
- **Vite** - Frontend build tool
- **Web Speech API** - Speech recognition
- **face-api.js** - Face detection and recognition

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **MongoDB** - Database
- **JWT** - Authentication tokens

### AI/ML
- **TensorFlow.js** - Face detection & recognition
- **Web Audio API** - Audio processing
- **NLP.js** - Natural language processing
- **Hugging Face** - Text-to-speech models

## 📚 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/enroll` - Enroll biometric data

### Verification
- `POST /api/verify/voice` - Verify voice signature
- `POST /api/verify/face` - Verify facial recognition
- `POST /api/voiceVerify` - Combined voice verification

### Payment
- `POST /api/payment/process` - Process payment
- `POST /api/payment/verify` - Verify payment with biometrics

### Speech
- `POST /api/speech/recognize` - Convert speech to text
- `POST /api/speech/synthesize` - Convert text to speech

## 🔒 Security Features

- End-to-end encryption for biometric data
- Secure JWT token management
- Voice and facial biometric salting
- PCI DSS compliance for payment processing
- GDPR-compliant data storage
- Secure API authentication

## 🎓 Usage Examples

### Voice Enrollment
```javascript
// User enrolls voice biometrics
const response = await fetch('/api/auth/enroll', {
  method: 'POST',
  body: audioBlob
});
```

### Payment with Voice Verification
```javascript
// Process payment with voice authentication
const payment = await fetch('/api/payment/process', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ amount: 100, voiceData: audioBlob })
});
```

## 📊 Configuration

### Environment Variables
```env
# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/?appName=Cluster0

# Security
JWT_SECRET=your_jwt_secret_key_here

# API
PORT=5005

# External APIs
HF_ACCESS_TOKEN=your_hugging_face_token_here
```

## 🚨 Troubleshooting

**Microphone Access Denied**
- Check browser permissions for microphone access
- Ensure HTTPS is used in production

**Face Detection Not Working**
- Verify camera permissions are granted
- Check lighting conditions
- Ensure face is clearly visible

**Model Loading Issues**
- Verify models are present in `public/models/`
- Check network connectivity for downloading models

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📧 Support

For issues and questions, please open an issue on the GitHub repository.

---

**⚠️ Important:** This application handles sensitive biometric data. Ensure proper security measures and compliance are maintained in production environments.
