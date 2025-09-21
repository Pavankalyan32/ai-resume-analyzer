import React, { useState, useEffect } from 'react';
import EnhancedFileUpload from './components/EnhancedFileUpload.jsx';
import { processMultipleFiles } from './utils/fileHandler.js';

// --- Helper Components ---
const Spinner = ({ small = false }) => (
    <div className="flex justify-center items-center">
        <div className={`animate-spin rounded-full border-b-2 border-indigo-500 ${small ? 'h-5 w-5' : 'h-8 w-8'}`}></div>
    </div>
);

const ErrorMessage = ({ message }) => (
    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative" role="alert">
        <strong className="font-bold">Oops! </strong>
        <span className="block sm:inline">{message}</span>
    </div>
);

const UploadIcon = () => (
    <svg className="w-8 h-8 mb-4 text-gray-500" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
        <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
    </svg>
);


// --- Main Application Component ---
const App = () => {
    // --- State Management ---
    const [resume, setResume] = useState('');
    const [uploadedFiles, setUploadedFiles] = useState([]);
    const [jobDescription, setJobDescription] = useState('');
    const [experienceLevel, setExperienceLevel] = useState('fresher'); // 'fresher' or 'experienced'
    const [analysisResult, setAnalysisResult] = useState(null);
    const [internships, setInternships] = useState([]);
    const [interviewQuestions, setInterviewQuestions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingQuestions, setLoadingQuestions] = useState(false);
    const [error, setError] = useState('');
    const [uploadError, setUploadError] = useState('');
    const [questionsError, setQuestionsError] = useState('');

    // --- File handling functions ---
    const handleFilesProcessed = (files) => {
        setUploadedFiles(files);
        setUploadError('');
        
        // Combine all text from uploaded files
        const combinedText = files.map(file => file.text).join('\n\n---\n\n');
        setResume(combinedText);
    };

    const handleUploadError = (errorMessage) => {
        setUploadError(errorMessage);
    };


    // --- API Interaction ---

    /**
     * Calls the Gemini API with exponential backoff for retries.
     * @param {object} payload - The payload to send to the API.
     * @param {number} maxRetries - Maximum number of retries.
     * @returns {Promise<object>} - The JSON response from the API.
     */
    const callGeminiAPI = async (payload, maxRetries = 3) => {
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY; // Get API key from environment
        
        if (!apiKey) {
            throw new Error('Gemini API key not configured. Please add VITE_GEMINI_API_KEY to your .env file.');
        }
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
        
        let attempt = 0;
        let delay = 1000; // Start with 1 second

        while (attempt < maxRetries) {
            try {
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    throw new Error(`API Error: ${response.status} ${response.statusText}`);
                }

                const result = await response.json();
                
                const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!text) {
                    throw new Error("Invalid response structure from API.");
                }
                
                // The API returns a JSON string, so we need to parse it
                return JSON.parse(text);

            } catch (err) {
                attempt++;
                if (attempt >= maxRetries) {
                    throw err; // Rethrow error after max retries
                }
                console.warn(`API call failed, retrying in ${delay}ms... (Attempt ${attempt})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Exponential backoff
            }
        }
    };


    /**
     * Fetches the ATS score and feedback from the Gemini API.
     * @param {string} currentResume - The user's resume text.
     * @param {string} currentJobDesc - The job description text.
     * @returns {Promise<object>} - An object containing the score and feedback.
     */
    const getATSScore = async (currentResume, currentJobDesc, level) => {
        const experienceContext = level === 'fresher' 
            ? `This is a FRESHER/ENTRY-LEVEL candidate. Adjust your expectations accordingly but still be brutally honest about their readiness.`
            : `This is an EXPERIENCED candidate. Hold them to higher standards and expect more from their resume.`;

        const payload = {
            contents: [{
                parts: [{
                    text: `
                        You are a BRUTALLY HONEST recruiter and ATS expert with 1+ years of experience at tech companies. 
                        You have ZERO tolerance for mediocrity and will give STRAIGHT, UNFILTERED feedback.
                        
                        ${experienceContext}
                        
                        Analyze this resume against the job description with ABSOLUTE HONESTY. No sugar-coating, no mercy, no false hope.
                        
                        CRITICAL ANALYSIS REQUIREMENTS:
                        1. Score based on ACTUAL match percentage (0-100) - be HARSH but FAIR for their level
                        2. If the candidate is underqualified, say it directly
                        3. If they're overqualified, point out the mismatch
                        4. Identify missing CRITICAL skills that will get them rejected
                        5. Point out weak experience, poor formatting, or red flags
                        6. Be SPECIFIC about what will get them filtered out by ATS
                        7. Don't give participation trophies - if it's bad, say it's bad
                        8. For freshers: Focus on potential, basic skills, and learning ability
                        9. For experienced: Focus on depth, leadership, and advanced skills
                        
                        Resume:
                        ---
                        ${currentResume}
                        ---

                        Job Description:
                        ---
                        ${currentJobDesc}
                        ---
                        
                        RESPOND WITH BRUTAL HONESTY. The candidate needs to know the TRUTH to improve.
                    `
                }]
            }],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        score: { type: "NUMBER" },
                        harshReality: { type: "STRING" },
                        criticalIssues: {
                            type: "ARRAY",
                            items: { type: "STRING" }
                        },
                        missingSkills: {
                            type: "ARRAY",
                            items: { type: "STRING" }
                        },
                        strengths: {
                            type: "ARRAY",
                            items: { type: "STRING" }
                        },
                        atsKillers: {
                            type: "ARRAY",
                            items: { type: "STRING" }
                        },
                        recommendation: { type: "STRING" }
                    }
                }
            }
        };
        return callGeminiAPI(payload);
    };

    /**
     * Fetches internship suggestions from the Gemini API.
     * @param {string} currentResume - The user's resume text.
     * @returns {Promise<object>} - An object containing a list of internships.
     */
    const getInternshipSuggestions = async (currentResume, level) => {
        const experienceContext = level === 'fresher' 
            ? `This is a FRESHER/ENTRY-LEVEL candidate. Focus on entry-level internships, basic skill requirements, and learning opportunities.`
            : `This is an EXPERIENCED candidate. Focus on advanced internships, leadership roles, and specialized positions.`;

        const payload = {
            contents: [{
                parts: [{
                    text: `
                        You are a RUTHLESS career advisor who tells candidates the BRUTAL TRUTH about their prospects.
                        No sugar-coating, no false encouragement, no participation trophies.
                        
                        ${experienceContext}
                        
                        Based on this resume, give HONEST internship recommendations. If the candidate is unqualified, say it.
                        If they need to improve significantly, be direct about it.
                        
                        HONEST ASSESSMENT REQUIREMENTS:
                        1. Only suggest internships they're ACTUALLY qualified for
                        2. If they're not ready for any internships, say so directly
                        3. Point out what's missing for each suggested role
                        4. Be realistic about competition and requirements
                        5. Don't give false hope - if they need 6+ months of skill building, say it
                        6. For freshers: Focus on learning opportunities, basic projects, entry-level roles
                        7. For experienced: Focus on advanced projects, leadership opportunities, specialized roles
                        
                        Resume:
                        ---
                        ${currentResume}
                        ---
                        
                        Give REALISTIC, UNFILTERED advice. The candidate needs the TRUTH to make informed decisions.
                    `
                }]
            }],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        realityCheck: { type: "STRING" },
                        qualifiedInternships: {
                            type: "ARRAY",
                            items: {
                                type: "OBJECT",
                                properties: {
                                    title: { type: "STRING" },
                                    description: { type: "STRING" },
                                    requirements: { type: "STRING" },
                                    competitiveness: { type: "STRING" }
                                }
                            }
                        },
                        missingForInternships: {
                            type: "ARRAY",
                            items: { type: "STRING" }
                        },
                        timeToPrepare: { type: "STRING" }
                    }
                }
            }
        };
        return callGeminiAPI(payload);
    };

    /**
     * Fetches personalized interview questions from the Gemini API.
     * @param {string} currentResume - The user's resume text.
     * @param {string} currentJobDesc - The job description text.
     * @returns {Promise<object>} - An object containing a list of questions.
     */
    const getInterviewQuestions = async (currentResume, currentJobDesc, level) => {
        const experienceContext = level === 'fresher' 
            ? `This is a FRESHER/ENTRY-LEVEL candidate. Focus on basic technical skills, learning ability, problem-solving fundamentals, and potential.`
            : `This is an EXPERIENCED candidate. Focus on advanced technical skills, leadership, system design, and deep domain knowledge.`;

        const payload = {
            contents: [{
                parts: [{
                    text: `
                        You are a RUTHLESS hiring manager at a tech company.
                        You've interviewed many candidates and have ZERO tolerance for BS, weak answers, or unprepared candidates.
                        
                        ${experienceContext}
                        
                        Generate BRUTALLY HONEST interview questions that will EXPOSE weaknesses and test REAL competency.
                        These questions should be the kind that separate strong candidates from weak ones.
                        
                        BRUTAL INTERVIEW REQUIREMENTS:
                        1. Ask questions that will EXPOSE gaps in their resume
                        2. Challenge their claimed experience with specific technical details
                        3. Include questions that test problem-solving under pressure
                        4. Ask about failures, mistakes, and difficult situations
                        5. Test their ability to handle criticism and feedback
                        6. Include questions that reveal their actual skill level vs. claimed level
                        7. Make them defend their experience with concrete examples
                        8. For freshers: Focus on fundamentals, basic coding, learning ability, and potential
                        9. For experienced: Focus on advanced concepts, system design, leadership, and deep technical knowledge
                        
                        Resume:
                        ---
                        ${currentResume}
                        ---

                        Job Description:
                        ---
                        ${currentJobDesc}
                        ---
                        
                        Generate questions that will SEPARATE the strong from the weak. No mercy, no easy questions.
                    `
                }]
            }],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        brutalQuestions: {
                            type: "ARRAY",
                            items: {
                                type: "OBJECT",
                                properties: {
                                    question: { type: "STRING" },
                                    category: { type: "STRING" },
                                    whyThisQuestion: { type: "STRING" },
                                    difficulty: { type: "STRING" },
                                    redFlags: { type: "STRING" }
                                }
                            }
                        },
                        interviewReality: { type: "STRING" },
                        preparationAdvice: { type: "STRING" }
                    }
                }
            }
        };
        return callGeminiAPI(payload);
    };

    // --- Event Handlers ---

    /**
     * Handles the main analysis logic when the user clicks the button.
     */
    const handleAnalyze = async () => {
        if (!resume || !jobDescription || !experienceLevel) {
            setError('Please upload your documents, paste the job description, and select your experience level.');
            return;
        }

        setLoading(true);
        setError('');
        setAnalysisResult(null);
        setInternships([]);
        setInterviewQuestions([]); // Clear previous questions
        setQuestionsError(''); // Clear previous errors

        try {
            // Run API calls in parallel
            const [atsResponse, internshipResponse] = await Promise.all([
                getATSScore(resume, jobDescription, experienceLevel),
                getInternshipSuggestions(resume, experienceLevel)
            ]);
            
            setAnalysisResult(atsResponse);
            setInternships(internshipResponse.qualifiedInternships || []);

        } catch (err) {
            console.error("Error during analysis:", err);
            setError('Failed to analyze the resume. Please check your connection and try again.');
        } finally {
            setLoading(false);
        }
    };

    /**
     * Handles generating interview questions.
     */
    const handleGenerateQuestions = async () => {
        setLoadingQuestions(true);
        setQuestionsError('');
        setInterviewQuestions([]);

        try {
            const response = await getInterviewQuestions(resume, jobDescription, experienceLevel);
            setInterviewQuestions(response.brutalQuestions || []);
        } catch (err) {
            console.error("Error generating questions:", err);
            setQuestionsError("Couldn't generate questions. Please try again.");
        } finally {
            setLoadingQuestions(false);
        }
    };
    
    // --- Render Logic ---

    return (
        <div className="gradient-bg min-h-screen">
            {/* Background Decoration */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 left-0 w-72 h-72 bg-gradient-to-br from-indigo-400/20 to-purple-400/20 rounded-full blur-3xl transform -translate-x-1/2 -translate-y-1/2"></div>
                <div className="absolute bottom-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-400/20 to-indigo-400/20 rounded-full blur-3xl transform translate-x-1/2 translate-y-1/2"></div>
            </div>
            
            {/* Navigation Bar */}
            <nav className="relative z-20 glass-nav p-6">
                <div className="container mx-auto flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        <h1 className="text-2xl font-bold gradient-text">AI Resume Analyzer</h1>
                    </div>
                    <div className="hidden md:flex items-center space-x-6 text-sm font-medium text-gray-600">
                        <span className="flex items-center">
                            <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                            AI-Powered
                        </span>
                        <span className="flex items-center">
                            <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                            Real-time
                        </span>
                        <span className="flex items-center">
                            <div className="w-2 h-2 bg-purple-500 rounded-full mr-2"></div>
                            Secure
                        </span>
                    </div>
                </div>
            </nav>
            
            <div className="relative z-10 container mx-auto px-4 py-12 md:px-8">
                {/* Hero Section */}
                <section className="text-center mb-20 py-16">
                    <div className="floating-element mx-auto mb-10">
                        <div className="w-28 h-28 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-3xl flex items-center justify-center shadow-2xl transform hover:scale-105 transition-all duration-300">
                            <svg className="w-14 h-14 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        </div>
                    </div>
                    <h1 className="text-5xl md:text-7xl font-black text-gray-900 mb-8 tracking-tight leading-none">
                        Transform Your
                        <br />
                        <span className="gradient-text">Career Journey</span>
                    </h1>
                    <p className="text-xl md:text-2xl text-gray-600 max-w-4xl mx-auto leading-relaxed mb-12">
                        Get AI-powered resume analysis, discover perfect internship matches, and master interview preparation—all in one powerful platform.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-6 text-sm font-medium text-gray-500 mb-10">
                        <div className="flex items-center bg-white/60 backdrop-blur-sm px-5 py-3 rounded-full shadow-sm">
                            <svg className="w-5 h-5 text-green-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Instant ATS Scoring
                        </div>
                        <div className="flex items-center bg-white/60 backdrop-blur-sm px-5 py-3 rounded-full shadow-sm">
                            <svg className="w-5 h-5 text-blue-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Personalized Insights
                        </div>
                        <div className="flex items-center bg-white/60 backdrop-blur-sm px-5 py-3 rounded-full shadow-sm">
                            <svg className="w-5 h-5 text-purple-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Interview Prep
                        </div>
                    </div>
                </section>

                <main>
                    {/* Step Indicator */}
                    <div className="flex items-center justify-center mb-16">
                        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/50">
                            <div className="flex items-center space-x-3 md:space-x-6">
                                <div className="flex items-center flex-shrink-0">
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 ${
                                        uploadedFiles.length > 0 ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white' : 'bg-gray-200 text-gray-500'
                                    }`}>
                                        1
                                    </div>
                                    <span className={`ml-3 font-medium transition-colors duration-300 ${
                                        uploadedFiles.length > 0 ? 'text-gray-700' : 'text-gray-400'
                                    }`}>Upload</span>
                                </div>
                                <div className="w-8 md:w-12 h-0.5 bg-gradient-to-r from-indigo-200 to-purple-200 flex-shrink-0"></div>
                                <div className="flex items-center flex-shrink-0">
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 ${
                                        jobDescription ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white' : 'bg-gray-200 text-gray-500'
                                    }`}>
                                        2
                                    </div>
                                    <span className={`ml-3 font-medium transition-colors duration-300 ${
                                        jobDescription ? 'text-gray-700' : 'text-gray-400'
                                    }`}>Job Desc</span>
                                </div>
                                <div className="w-8 md:w-12 h-0.5 bg-gradient-to-r from-indigo-200 to-purple-200 flex-shrink-0"></div>
                                <div className="flex items-center flex-shrink-0">
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 ${
                                        experienceLevel ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white' : 'bg-gray-200 text-gray-500'
                                    }`}>
                                        3
                                    </div>
                                    <span className={`ml-3 font-medium transition-colors duration-300 ${
                                        experienceLevel ? 'text-gray-700' : 'text-gray-400'
                                    }`}>Level</span>
                                </div>
                                <div className="w-8 md:w-12 h-0.5 bg-gradient-to-r from-indigo-200 to-purple-200 flex-shrink-0"></div>
                                <div className="flex items-center flex-shrink-0">
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 ${
                                        analysisResult ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white' : 'bg-gray-200 text-gray-500'
                                    }`}>
                                        4
                                    </div>
                                    <span className={`ml-3 font-medium transition-colors duration-300 ${
                                        analysisResult ? 'text-gray-700' : 'text-gray-400'
                                    }`}>Analysis</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Input Section with Better Structure */}
                    <section className="mb-20">
                        <div className="text-center mb-16">
                            <h2 className="text-4xl font-bold text-gray-900 mb-6">Get Started in Seconds</h2>
                            <p className="text-lg text-gray-600 max-w-2xl mx-auto">Upload your documents and paste the job description to unlock personalized career insights</p>
                        </div>
                        
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
                            {/* Enhanced File Upload Card */}
                            <div className="card card-hover p-8 h-full">
                                <div className="flex items-center mb-6">
                                    <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mr-4">
                                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-gray-800">Upload Your Documents</h3>
                                        <p className="text-sm text-gray-500">Resume, cover letter, portfolio - all supported</p>
                                    </div>
                                </div>
                                
                                <EnhancedFileUpload
                                    onFilesProcessed={handleFilesProcessed}
                                    onError={handleUploadError}
                                    disabled={loading}
                                    maxFiles={5}
                                />
                                
                                {uploadError && (
                                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                                        <p className="text-sm text-red-600 text-center">{uploadError}</p>
                                    </div>
                                )}
                            </div>
                            
                            {/* Job Description Card */}
                            <div className="card card-hover p-8 h-full">
                                <div className="flex items-center mb-6">
                                    <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center mr-4">
                                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-gray-800">Job Description</h3>
                                        <p className="text-sm text-gray-500">Paste the full job posting</p>
                                    </div>
                                </div>
                                
                                <div className="relative">
                                    <textarea
                                        id="jobDescription"
                                        value={jobDescription}
                                        onChange={(e) => setJobDescription(e.target.value)}
                                        className="w-full p-6 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white/80 backdrop-blur-sm resize-none h-80 text-gray-700 placeholder-gray-400"
                                        placeholder="Paste the complete job description here...\n\n• Include job title, responsibilities, and requirements\n• Add skills and qualifications needed\n• Include company information if available\n\nThe more detailed the job description, the better your analysis will be!"
                                    />
                                    <div className="absolute bottom-3 right-3 text-xs text-gray-400">
                                        {jobDescription.length} characters
                                    </div>
                                </div>
                                
                                {jobDescription && (
                                    <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                                        <p className="text-sm text-green-700 flex items-center">
                                            <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                            </svg>
                                            Job description added successfully
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* Experience Level Selector */}
                    <section className="mb-20">
                        <div className="max-w-4xl mx-auto">
                            <div className="text-center mb-12">
                                <h2 className="text-3xl font-bold text-gray-900 mb-4">Select Your Experience Level</h2>
                                <p className="text-lg text-gray-600">This helps us provide more accurate feedback tailored to your level</p>
                            </div>
                            
                            <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-8 border border-white/50 shadow-xl">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Fresher Option */}
                                    <div 
                                        className={`cursor-pointer p-6 rounded-xl border-2 transition-all duration-300 ${
                                            experienceLevel === 'fresher' 
                                                ? 'border-indigo-500 bg-indigo-50 shadow-lg' 
                                                : 'border-gray-200 bg-white hover:border-indigo-300 hover:shadow-md'
                                        }`}
                                        onClick={() => setExperienceLevel('fresher')}
                                    >
                                        <div className="text-center">
                                            <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${
                                                experienceLevel === 'fresher' 
                                                    ? 'bg-indigo-500 text-white' 
                                                    : 'bg-gray-100 text-gray-600'
                                            }`}>
                                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                                </svg>
                                            </div>
                                            <h3 className="text-xl font-bold text-gray-800 mb-2">Fresher / Entry Level</h3>
                                            <p className="text-sm text-gray-600 mb-4">
                                                Recent graduate, bootcamp graduate, or career changer with 0-2 years experience
                                            </p>
                                            <div className="text-xs text-gray-500 space-y-1">
                                                <p>• Focus on basic skills & potential</p>
                                                <p>• Entry-level internships & roles</p>
                                                <p>• Learning ability assessment</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Experienced Option */}
                                    <div 
                                        className={`cursor-pointer p-6 rounded-xl border-2 transition-all duration-300 ${
                                            experienceLevel === 'experienced' 
                                                ? 'border-indigo-500 bg-indigo-50 shadow-lg' 
                                                : 'border-gray-200 bg-white hover:border-indigo-300 hover:shadow-md'
                                        }`}
                                        onClick={() => setExperienceLevel('experienced')}
                                    >
                                        <div className="text-center">
                                            <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${
                                                experienceLevel === 'experienced' 
                                                    ? 'bg-indigo-500 text-white' 
                                                    : 'bg-gray-100 text-gray-600'
                                            }`}>
                                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2-2v2m8 0V6a2 2 0 012 2v6a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2V6" />
                                                </svg>
                                            </div>
                                            <h3 className="text-xl font-bold text-gray-800 mb-2">Experienced Professional</h3>
                                            <p className="text-sm text-gray-600 mb-4">
                                                2+ years of professional experience in the field
                                            </p>
                                            <div className="text-xs text-gray-500 space-y-1">
                                                <p>• Advanced skills & leadership</p>
                                                <p>• Senior roles & responsibilities</p>
                                                <p>• Deep technical knowledge</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Current Selection Indicator */}
                                <div className="mt-6 text-center">
                                    <div className="inline-flex items-center px-4 py-2 bg-indigo-100 text-indigo-800 rounded-full text-sm font-medium">
                                        <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                        Selected: {experienceLevel === 'fresher' ? 'Fresher / Entry Level' : 'Experienced Professional'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Enhanced Action Section */}
                    <section className="text-center mb-20">
                        <div className="max-w-3xl mx-auto">
                            <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-10 border border-white/50 shadow-xl">
                                <h3 className="text-3xl font-bold text-gray-900 mb-6">Ready for Analysis?</h3>
                                <p className="text-lg text-gray-600 mb-10">Get instant insights about your resume's compatibility with the job posting</p>
                                
                                <button
                                    onClick={handleAnalyze}
                                    disabled={loading || !resume || !jobDescription || !experienceLevel}
                                    className="btn-primary mb-6"
                                >
                                    {loading ? (
                                        <>
                                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            Analyzing Your Resume...
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-5 h-5 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                            </svg>
                                            Start AI Analysis
                                        </>
                                    )}
                                </button>
                                
                                {(!resume || !jobDescription || !experienceLevel) && (
                                    <div className="flex items-center justify-center space-x-2 text-sm flex-wrap">
                                        <div className={`flex items-center px-3 py-1 rounded-full ${
                                            uploadedFiles.length > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                                        }`}>
                                            <div className={`w-2 h-2 rounded-full mr-2 ${
                                                uploadedFiles.length > 0 ? 'bg-green-500' : 'bg-gray-400'
                                            }`}></div>
                                            Documents {uploadedFiles.length > 0 ? `(${uploadedFiles.length})` : 'needed'}
                                        </div>
                                        <div className={`flex items-center px-3 py-1 rounded-full ${
                                            jobDescription ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                                        }`}>
                                            <div className={`w-2 h-2 rounded-full mr-2 ${
                                                jobDescription ? 'bg-green-500' : 'bg-gray-400'
                                            }`}></div>
                                            Job desc {jobDescription ? 'added' : 'needed'}
                                        </div>
                                        <div className={`flex items-center px-3 py-1 rounded-full ${
                                            experienceLevel ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                                        }`}>
                                            <div className={`w-2 h-2 rounded-full mr-2 ${
                                                experienceLevel ? 'bg-green-500' : 'bg-gray-400'
                                            }`}></div>
                                            Level {experienceLevel ? 'selected' : 'needed'}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* Loading and Error States */}
                    {loading && (
                        <div className="text-center mb-12">
                            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-r from-indigo-100 to-purple-100 rounded-full mb-4">
                                <Spinner />
                            </div>
                            <h3 className="text-xl font-semibold text-gray-800 mb-2">Analyzing Your Resume</h3>
                            <p className="text-gray-600">Our AI is carefully reviewing your resume against the job requirements...</p>
                        </div>
                    )}
                    {error && (
                        <div className="max-w-2xl mx-auto mb-12">
                            <ErrorMessage message={error} />
                        </div>
                    )}

                    {/* Results Section - Enhanced Structure */}
                    {analysisResult && (
                        <section className="mb-16">
                            <div className="text-center mb-12">
                                <h2 className="text-4xl font-bold text-gray-900 mb-4">Your Analysis Results</h2>
                                <p className="text-lg text-gray-600 max-w-2xl mx-auto">Here's what our AI discovered about your resume's compatibility with this job</p>
                            </div>
                            
                            <div className="max-w-7xl mx-auto">
                                {/* Main Analysis Section */}
                                <div className="space-y-8 mb-12">
                                    {/* ATS Score Card */}
                                    <div className="card p-8">
                                        <div className="flex flex-col lg:flex-row items-center gap-8">
                                            {/* Score Visualization */}
                                            <div className="flex-shrink-0">
                                                <div className="score-circle">
                                                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                                                        <path className="text-gray-200" stroke="currentColor" strokeWidth="3" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"></path>
                                                        <path
                                                            className="text-gradient-to-r from-indigo-500 to-purple-500"
                                                            stroke="url(#gradient)"
                                                            strokeWidth="3"
                                                            strokeDasharray={`${analysisResult.score}, 100`}
                                                            strokeLinecap="round"
                                                            fill="none"
                                                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                                        ></path>
                                                        <defs>
                                                            <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                                                <stop offset="0%" stopColor="#6366f1" />
                                                                <stop offset="100%" stopColor="#a855f7" />
                                                            </linearGradient>
                                                        </defs>
                                                    </svg>
                                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                                        <span className="text-4xl font-black gradient-text">{analysisResult.score}%</span>
                                                        <span className="text-sm text-gray-500 font-medium">ATS Match</span>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            {/* Score Interpretation */}
                                            <div className="flex-1 text-center lg:text-left">
                                                <h3 className="text-2xl font-bold text-gray-800 mb-4">
                                                    {analysisResult.score >= 80 ? 'Strong Match - You\'re Competitive' : 
                                                     analysisResult.score >= 60 ? 'Decent Match - Room for Improvement' : 
                                                     analysisResult.score >= 40 ? 'Weak Match - Major Issues' : 'Poor Match - Significant Problems'}
                                                </h3>
                                                
                                                {/* Harsh Reality Check */}
                                                {analysisResult.harshReality && (
                                                    <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6">
                                                        <div className="flex">
                                                            <div className="flex-shrink-0">
                                                                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                                                </svg>
                                                            </div>
                                                            <div className="ml-3">
                                                                <h4 className="text-sm font-medium text-red-800">BRUTAL HONESTY</h4>
                                                                <p className="text-sm text-red-700 mt-1">{analysisResult.harshReality}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="flex items-center justify-center lg:justify-start space-x-4 text-sm">
                                                    <div className={`px-3 py-1 rounded-full font-medium ${
                                                        analysisResult.score >= 80 ? 'bg-green-100 text-green-700' :
                                                        analysisResult.score >= 60 ? 'bg-yellow-100 text-yellow-700' :
                                                        analysisResult.score >= 40 ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'
                                                    }`}>
                                                        {analysisResult.score >= 80 ? 'Competitive' :
                                                         analysisResult.score >= 60 ? 'Needs Work' :
                                                         analysisResult.score >= 40 ? 'Major Issues' : 'Poor Match'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Harsh Feedback Sections */}
                                    <div className="space-y-6">
                                        {/* Critical Issues */}
                                        {analysisResult.criticalIssues && analysisResult.criticalIssues.length > 0 && (
                                            <div className="bg-gradient-to-br from-red-50 to-rose-50 p-6 rounded-2xl border border-red-200">
                                                <h4 className="text-xl font-bold text-red-800 mb-4 flex items-center">
                                                    <svg className="w-6 h-6 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                                    </svg>
                                                    CRITICAL ISSUES - Fix These NOW
                                                </h4>
                                                <ul className="space-y-3">
                                                    {analysisResult.criticalIssues.map((issue, i) => (
                                                        <li key={i} className="flex items-start">
                                                            <span className="text-red-500 mr-3 mt-1 flex-shrink-0">⚠</span>
                                                            <span className="text-gray-800 leading-relaxed font-medium">{issue}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {/* Missing Skills */}
                                        {analysisResult.missingSkills && analysisResult.missingSkills.length > 0 && (
                                            <div className="bg-gradient-to-br from-orange-50 to-amber-50 p-6 rounded-2xl border border-orange-200">
                                                <h4 className="text-xl font-bold text-orange-800 mb-4 flex items-center">
                                                    <svg className="w-6 h-6 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                                    </svg>
                                                    MISSING SKILLS - You Need These
                                                </h4>
                                                <ul className="space-y-3">
                                                    {analysisResult.missingSkills.map((skill, i) => (
                                                        <li key={i} className="flex items-start">
                                                            <span className="text-orange-500 mr-3 mt-1 flex-shrink-0">❌</span>
                                                            <span className="text-gray-800 leading-relaxed">{skill}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {/* ATS Killers */}
                                        {analysisResult.atsKillers && analysisResult.atsKillers.length > 0 && (
                                            <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-6 rounded-2xl border border-purple-200">
                                                <h4 className="text-xl font-bold text-purple-800 mb-4 flex items-center">
                                                    <svg className="w-6 h-6 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd" />
                                                    </svg>
                                                    ATS KILLERS - These Will Get You Rejected
                                                </h4>
                                                <ul className="space-y-3">
                                                    {analysisResult.atsKillers.map((killer, i) => (
                                                        <li key={i} className="flex items-start">
                                                            <span className="text-purple-500 mr-3 mt-1 flex-shrink-0">💀</span>
                                                            <span className="text-gray-800 leading-relaxed">{killer}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {/* Strengths */}
                                        {analysisResult.strengths && analysisResult.strengths.length > 0 && (
                                            <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-6 rounded-2xl border border-green-200">
                                                <h4 className="text-xl font-bold text-green-800 mb-4 flex items-center">
                                                    <svg className="w-6 h-6 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                    </svg>
                                                    What You Got Right
                                                </h4>
                                                <ul className="space-y-3">
                                                    {analysisResult.strengths.map((strength, i) => (
                                                        <li key={i} className="flex items-start">
                                                            <span className="text-green-500 mr-3 mt-1 flex-shrink-0">✓</span>
                                                            <span className="text-gray-700 leading-relaxed">{strength}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {/* Recommendation */}
                                        {analysisResult.recommendation && (
                                            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-6 rounded-2xl border border-blue-200">
                                                <h4 className="text-xl font-bold text-blue-800 mb-4 flex items-center">
                                                    <svg className="w-6 h-6 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                                    </svg>
                                                    BRUTAL RECOMMENDATION
                                                </h4>
                                                <p className="text-gray-800 leading-relaxed font-medium">{analysisResult.recommendation}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Additional Features Section */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                    {/* Internship Reality */}
                                    <div className="card p-8">
                                        <div className="flex items-center mb-6">
                                            <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center mr-4">
                                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2-2v2m8 0V6a2 2 0 012 2v6a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2V6" />
                                                </svg>
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-bold text-gray-800">BRUTAL INTERNSHIP REALITY</h3>
                                                <p className="text-sm text-gray-500">Honest assessment of your opportunities</p>
                                            </div>
                                        </div>
                                        
                                        {/* Reality Check */}
                                        {internships.realityCheck && (
                                            <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6 rounded-r-lg">
                                                <h4 className="text-sm font-medium text-red-800 mb-2">HARSH TRUTH</h4>
                                                <p className="text-sm text-red-700">{internships.realityCheck}</p>
                                            </div>
                                        )}

                                        {/* Qualified Internships */}
                                        {internships.length > 0 && (
                                            <div className="space-y-4">
                                                {internships.map((internship, index) => (
                                                    <div key={index} className="bg-gradient-to-r from-blue-50 to-indigo-50 p-5 rounded-xl border border-blue-200 hover:shadow-md transition-shadow">
                                                        <h4 className="font-bold text-lg text-blue-800 mb-2">{internship.title}</h4>
                                                        <p className="text-gray-600 text-sm leading-relaxed mb-3">{internship.description}</p>
                                                        
                                                        {internship.requirements && (
                                                            <div className="mb-3">
                                                                <span className="text-xs font-semibold text-orange-600 bg-orange-100 px-2 py-1 rounded">REQUIREMENTS:</span>
                                                                <p className="text-xs text-gray-600 mt-2">{internship.requirements}</p>
                                                            </div>
                                                        )}
                                                        
                                                        {internship.competitiveness && (
                                                            <div>
                                                                <span className="text-xs font-semibold text-red-600 bg-red-100 px-2 py-1 rounded">COMPETITION LEVEL:</span>
                                                                <p className="text-xs text-gray-600 mt-2">{internship.competitiveness}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Missing Skills for Internships */}
                                        {internships.missingForInternships && internships.missingForInternships.length > 0 && (
                                            <div className="mt-6 bg-orange-50 border border-orange-200 rounded-lg p-4">
                                                <h4 className="text-sm font-bold text-orange-800 mb-3">WHAT YOU'RE MISSING</h4>
                                                <ul className="space-y-2">
                                                    {internships.missingForInternships.map((missing, i) => (
                                                        <li key={i} className="flex items-start text-sm">
                                                            <span className="text-orange-500 mr-2 mt-0.5">❌</span>
                                                            <span className="text-gray-700">{missing}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {/* Time to Prepare */}
                                        {internships.timeToPrepare && (
                                            <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                                                <h4 className="text-sm font-bold text-yellow-800 mb-2">REALISTIC TIMELINE</h4>
                                                <p className="text-sm text-gray-700">{internships.timeToPrepare}</p>
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Interview Preparation */}
                                    <div className="card p-8">
                                        <div className="flex items-center mb-6">
                                            <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-600 rounded-xl flex items-center justify-center mr-4">
                                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-bold text-gray-800">BRUTAL INTERVIEW PREP</h3>
                                                <p className="text-sm text-gray-500">Questions that will expose your weaknesses</p>
                                            </div>
                                        </div>
                                        
                                        {interviewQuestions.length === 0 && !loadingQuestions && (
                                            <div className="text-center py-8">
                                                <div className="w-20 h-20 bg-gradient-to-r from-purple-100 to-pink-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                                    <svg className="w-10 h-10 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                                    </svg>
                                                </div>
                                                <h4 className="text-lg font-semibold text-gray-800 mb-3">Ready for Brutal Questions?</h4>
                                                <p className="text-gray-600 mb-6 text-sm leading-relaxed max-w-sm mx-auto">
                                                    Generate custom interview questions that will test your real competency and expose any gaps in your knowledge
                                                </p>
                                                <button 
                                                    onClick={handleGenerateQuestions}
                                                    className="bg-gradient-to-r from-purple-500 to-pink-600 text-white font-semibold py-3 px-6 rounded-lg hover:from-purple-600 hover:to-pink-700 transition-all duration-200 transform hover:scale-105 shadow-lg"
                                                >
                                                    Generate Brutal Questions
                                                </button>
                                            </div>
                                        )}
                                        
                                        {loadingQuestions && (
                                            <div className="text-center py-8">
                                                <div className="w-16 h-16 bg-gradient-to-r from-purple-100 to-pink-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                                    <Spinner small />
                                                </div>
                                                <h4 className="text-lg font-semibold text-gray-800 mb-2">Creating Your Questions</h4>
                                                <p className="text-gray-600 text-sm">Preparing brutally honest interview questions...</p>
                                            </div>
                                        )}
                                        
                                        {questionsError && (
                                            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                                <div className="flex items-center">
                                                    <svg className="w-5 h-5 text-red-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                                    </svg>
                                                    <p className="text-sm text-red-600 font-medium">Error generating questions</p>
                                                </div>
                                                <p className="text-sm text-red-600 mt-1">{questionsError}</p>
                                            </div>
                                        )}
                                        
                                        {interviewQuestions.length > 0 && (
                                            <div className="space-y-5">
                                                <div className="flex items-center justify-between">
                                                    <h4 className="text-lg font-semibold text-gray-800">Generated Questions</h4>
                                                    <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                                                        {interviewQuestions.length} questions
                                                    </span>
                                                </div>
                                                {interviewQuestions.map((q, index) => (
                                                    <div key={index} className="bg-gray-50 p-5 rounded-xl border border-gray-200 hover:shadow-md transition-shadow">
                                                        <p className="font-medium text-gray-800 mb-4 leading-relaxed">{q.question}</p>
                                                        
                                                        <div className="flex flex-wrap gap-2 mb-4">
                                                            <span className="inline-flex items-center text-xs font-medium px-3 py-1 rounded-full bg-purple-100 text-purple-800">
                                                                {q.category}
                                                            </span>
                                                            {q.difficulty && (
                                                                <span className="inline-flex items-center text-xs font-medium px-3 py-1 rounded-full bg-red-100 text-red-800">
                                                                    {q.difficulty}
                                                                </span>
                                                            )}
                                                        </div>
                                                        
                                                        {q.whyThisQuestion && (
                                                            <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                                                <span className="text-xs font-semibold text-blue-600">WHY THIS QUESTION:</span>
                                                                <p className="text-xs text-gray-700 mt-1">{q.whyThisQuestion}</p>
                                                            </div>
                                                        )}
                                                        
                                                        {q.redFlags && (
                                                            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                                                <span className="text-xs font-semibold text-red-600">RED FLAGS TO AVOID:</span>
                                                                <p className="text-xs text-red-700 mt-1">{q.redFlags}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </section>
                    )}
                </main>
            </div>
        </div>
    );
};

export default App;
