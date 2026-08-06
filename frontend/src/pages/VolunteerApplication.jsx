import React, { useState } from 'react'
import { Upload, Check, X, FileText, Loader } from 'lucide-react'
import { createWorker } from 'tesseract.js'
import { axiosInstance } from '../lib/axios'

// pdfjs is large and most visitors never upload a PDF, so load it on first use
// instead of in the initial bundle. Vite bundles it locally rather than
// fetching from a CDN, so parsing keeps working offline and under a strict CSP.
let pdfjsPromise = null
const loadPdfjs = () => {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist')
      const worker = await import('pdfjs-dist/build/pdf.worker.mjs?url')
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default
      return pdfjs
    })()
  }
  return pdfjsPromise
}

// Turn an axios failure into something a volunteer can act on. The generic
// fallbacks matter as much as the specific cases: an unexplained failure here
// leaves someone unsure whether they applied.
const readSubmitError = (error) => {
  const status = error.response?.status
  const detail = error.response?.data?.detail

  if (!error.response) return 'Cannot reach the server. Check your connection and try again.'
  if (status === 400 && typeof detail === 'string' && detail.includes('Email already exists')) {
    return 'An application with that email address has already been submitted.'
  }
  if (status === 422) return 'Some details are missing or invalid. Please check the form and try again.'
  if (status === 503) return detail || 'The service is busy right now. Please try again in a minute.'
  return detail || 'Something went wrong submitting your application. Please try again.'
}

const VolunteerApplication = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    gender: '',
    height: '',
    weight: '',
    medicalConditions: '',
    medications: '',
    allergies: '',
    pastSurgeries: '',
    files: []
  })

  const [files, setFiles] = useState([])
  const [uploadStatus, setUploadStatus] = useState({
    isUploading: false,
    success: false,
    error: null
  })
  const [processingFiles, setProcessingFiles] = useState(false)
  const [processingProgress, setProcessingProgress] = useState(0)
  const [clicked, setClicked] = useState({});

  const [matches, setMatches] = useState([])
  const [userId, setUserId] = useState(null)
  const [trials, setTrials] = useState({})
  const [explanation, setExplanation] = useState('')
  const [matchError, setMatchError] = useState(null)

  const fetchTrials = async (matchIds) => {
    const trialDetails = {}
    for (const trialId of matchIds) {
      try {
        const response = await axiosInstance.get(`/trials/${trialId}/info`)
        trialDetails[trialId] = response.data.user // API returns { "message": "...", "user": trial }
      } catch (error) {
        console.error(`Error fetching trial ${trialId}:`, error)
      }
    }
    setTrials(trialDetails)
  }

  const handleMatch = async (trialId) => {
    if (!userId) return

    try {
      await axiosInstance.post('/matches', { trial_id: trialId, user_id: userId })
      setClicked(prev => ({ ...prev, [trialId]: true }))
      setMatchError(null)
    } catch (error) {
      // A 409 means the application already went through for this trial, so
      // reflect it as applied rather than as a failure.
      if (error.response?.status === 409) {
        setClicked(prev => ({ ...prev, [trialId]: true }))
        return
      }
      setMatchError(readSubmitError(error))
    }
  }

  // Extract PDF text with pdfjs-dist, which is already a dependency.
  // This previously downloaded the Pyodide CPython runtime from a CDN and
  // pip-installed PyPDF2 in the browser to do the same job: tens of megabytes
  // per visitor, a hard dependency on a third-party CDN, and it shipped the
  // volunteer's filename into an interpolated Python string.
  const extractTextFromPDF = async (file) => {
    try {
      const { getDocument } = await loadPdfjs()
      const data = new Uint8Array(await file.arrayBuffer())
      const doc = await getDocument({ data }).promise
      const pages = []
      for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
        const page = await doc.getPage(pageNum)
        const content = await page.getTextContent()
        pages.push(content.items.map(item => item.str).join(' '))
      }
      await doc.destroy()
      return pages.join('\n').trim()
    } catch (error) {
      return `[Error extracting text from ${file.name}: ${error.message}]`
    }
  }

  // Use tesseract.js to extract text from image files
  const extractTextFromImage = async (file) => {
    try {
      const worker = await createWorker('eng')
      const imageUrl = URL.createObjectURL(file)
      const { data } = await worker.recognize(imageUrl)
      await worker.terminate()
      URL.revokeObjectURL(imageUrl)
      return data.text.trim()
    } catch (error) {
      console.error('Error extracting text from image:', error)
      return `[Error extracting text from ${file.name}: ${error.message}]`
    }
  }

  // Process the uploaded files
  const processFiles = async (selectedFiles) => {
    setProcessingFiles(true)
    setProcessingProgress(0)
    
    const newFiles = []
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i]
      let extractedText = ''
      
      setProcessingProgress((i / selectedFiles.length) * 100)
      
      if (file.type === 'application/pdf') {
        extractedText = await extractTextFromPDF(file)
      } else if (file.type.startsWith('image/')) {
        extractedText = await extractTextFromImage(file)
      }
      
      newFiles.push({
        file: file,
        name: file.name,
        type: file.type,
        text: extractedText
      })
    }
    
    // Functional updates: `files` captured at render time goes stale when two
    // uploads land close together, silently dropping the earlier batch.
    setFiles(prev => [...prev, ...newFiles])
    setFormData(prev => ({
      ...prev,
      files: [...prev.files, ...newFiles.map(f => ({
        name: f.name,
        type: f.type,
        text: f.text
      }))]
    }))
    
    setProcessingFiles(false)
    setProcessingProgress(100)
  }

  const handleFileChange = async (e) => {
    const selectedFiles = Array.from(e.target.files)
    if (selectedFiles.length > 0) {
      await processFiles(selectedFiles)
    }
  }

  const removeFile = (index) => {
    // Remove by position, not by name: filtering on name deleted every file
    // sharing that name, and two scans called "scan.pdf" is entirely normal.
    setFiles(prev => prev.filter((_, i) => i !== index))
    setFormData(prev => ({
      ...prev,
      files: prev.files.filter((_, i) => i !== index)
    }))
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData({
      ...formData,
      [name]: value
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setUploadStatus({ isUploading: true, success: false, error: null })
    try {
      const inputData = { ...formData, files: formData.files.map(f => f.text) }
      const response = await axiosInstance.post('/users/', inputData)

      const matchIds = response.data.matches ?? []
      setMatches(matchIds)
      setUserId(response.data.id)
      setExplanation(response.data.explanation ?? '')
      await fetchTrials(matchIds)

      // Only now is the submission actually successful. This used to be set
      // outside the try/catch, so a failed submission still showed the success
      // banner and the volunteer believed they had applied.
      setUploadStatus({ isUploading: false, success: true, error: null })
    } catch (error) {
      setUploadStatus({ isUploading: false, success: false, error: readSubmitError(error) })
    }
  }

  const getFileIcon = (fileType) => {
    if (fileType.includes('pdf')) {
      return '📄'
    } else if (fileType.includes('image')) {
      return '🖼️'
    } else {
      return '📁'
    }
  }

  return (
    <div className="min-h-screen bg-base-200 py-12 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body p-8">
            <h1 className="card-title text-4xl font-bold mb-8 justify-center">Volunteer Health Information</h1>
            
            {uploadStatus.success && (
              <div className="alert alert-success mb-6">
                <Check className="stroke-current shrink-0 h-6 w-6" />
                <span>Your information has been submitted successfully!</span>
              </div>
            )}
            
            {uploadStatus.error && (
              <div className="alert alert-error mb-6">
                <X className="stroke-current shrink-0 h-6 w-6" />
                <span>{uploadStatus.error}</span>
              </div>
            )}
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="divider divider-primary text-xl font-medium">Personal Information</div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text text-lg">Full Name</span>
                  </label>
                  <input 
                    type="text" 
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="Enter your full name" 
                    className="input input-bordered w-full" 
                    required
                  />
                </div>
                
                <div className="form-control">
                  <label className="label">
                    <span className="label-text text-lg">Email</span>
                  </label>
                  <input 
                    type="email" 
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="Enter your email" 
                    className="input input-bordered w-full" 
                    required
                  />
                </div>
                
                <div className="form-control">
                  <label className="label">
                    <span className="label-text text-lg">Phone</span>
                  </label>
                  <input 
                    type="tel" 
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    placeholder="Enter your phone number" 
                    className="input input-bordered w-full" 
                  />
                </div>
                
                <div className="form-control">
                  <label className="label">
                    <span className="label-text text-lg">Date of Birth</span>
                  </label>
                  <input 
                    type="date" 
                    name="dateOfBirth"
                    value={formData.dateOfBirth}
                    onChange={handleInputChange}
                    className="input input-bordered w-full" 
                    required
                  />
                </div>
                
                <div className="form-control">
                  <label className="label">
                    <span className="label-text text-lg">Gender</span>
                  </label>
                  <select 
                    name="gender"
                    value={formData.gender}
                    onChange={handleInputChange}
                    className="select select-bordered w-full"
                    required
                  >
                    <option value="" disabled>Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                    <option value="prefer-not-to-say">Prefer not to say</option>
                  </select>
                </div>
              </div>
              
              <div className="divider divider-primary text-xl font-medium">Physical Information</div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text text-lg">Height (cm)</span>
                  </label>
                  <input 
                    type="number" 
                    name="height"
                    value={formData.height}
                    onChange={handleInputChange}
                    placeholder="Enter your height in cm" 
                    className="input input-bordered w-full" 
                  />
                </div>
                
                <div className="form-control">
                  <label className="label">
                    <span className="label-text text-lg">Weight (kg)</span>
                  </label>
                  <input 
                    type="number" 
                    name="weight"
                    value={formData.weight}
                    onChange={handleInputChange}
                    placeholder="Enter your weight in kg" 
                    className="input input-bordered w-full" 
                  />
                </div>
              </div>
              
              <div className="divider divider-primary text-xl font-medium">Medical Information</div>
              
              <div className="form-control">
                <label className="label">
                  <span className="label-text text-lg">Medical Conditions</span>
                </label>
                <textarea 
                  name="medicalConditions"
                  value={formData.medicalConditions}
                  onChange={handleInputChange}
                  placeholder="List any medical conditions you have" 
                  className="textarea textarea-bordered h-24 w-full" 
                />
              </div>
              
              <div className="form-control">
                <label className="label">
                  <span className="label-text text-lg">Current Medications</span>
                </label>
                <textarea 
                  name="medications"
                  value={formData.medications}
                  onChange={handleInputChange}
                  placeholder="List any medications you're currently taking" 
                  className="textarea textarea-bordered h-24 w-full" 
                />
              </div>
              
              <div className="form-control">
                <label className="label">
                  <span className="label-text text-lg">Allergies</span>
                </label>
                <textarea 
                  name="allergies"
                  value={formData.allergies}
                  onChange={handleInputChange}
                  placeholder="List any allergies you have" 
                  className="textarea textarea-bordered h-24 w-full" 
                />
              </div>
              
              <div className="form-control">
                <label className="label">
                  <span className="label-text text-lg">Past Surgeries or Procedures</span>
                </label>
                <textarea 
                  name="pastSurgeries"
                  value={formData.pastSurgeries}
                  onChange={handleInputChange}
                  placeholder="List any past surgeries or medical procedures" 
                  className="textarea textarea-bordered h-24 w-full" 
                />
              </div>
              
              <div className="divider divider-primary text-xl font-medium">Upload Medical Documents</div>
              
              <div className="form-control">
                <label className="label">
                  <span className="label-text text-lg">Upload Medical Records (PDF, Images)</span>
                </label>
                <div className="flex items-center justify-center w-full">
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-base-200 border-base-300 hover:border-primary hover:bg-base-300">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      {processingFiles ? (
                        <>
                          <Loader className="w-10 h-10 mb-3 text-gray-500 animate-spin" />
                          <p className="mb-2 text-sm text-gray-500">
                            Processing files ({Math.round(processingProgress)}%)
                          </p>
                        </>
                      ) : (
                        <>
                          <Upload className="w-10 h-10 mb-3 text-gray-500" />
                          <p className="mb-2 text-sm text-gray-500">
                            <span className="font-semibold">Click to upload</span> or drag and drop
                          </p>
                          <p className="text-xs text-gray-500">PDF, JPG, PNG (MAX. 10MB per file)</p>
                        </>
                      )}
                    </div>
                    <input 
                      id="dropzone-file" 
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      multiple 
                      onChange={handleFileChange}
                      className="hidden"
                      disabled={processingFiles}
                    />
                  </label>
                </div>
              </div>
              
              {files.length > 0 && (
                <div className="bg-base-200 p-4 rounded-lg">
                  <h3 className="font-medium mb-2">Uploaded Files:</h3>
                  <ul className="space-y-2">
                    {files.map((file, index) => (
                      <li key={index} className="bg-base-100 p-2 rounded">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center">
                            <span className="mr-2 text-xl">{getFileIcon(file.type)}</span>
                            <span className="truncate max-w-xs">{file.name}</span>
                          </div>
                          <button 
                            type="button"
                            onClick={() => removeFile(index)}
                            className="btn btn-sm btn-circle btn-ghost"
                            disabled={processingFiles}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        {file.text && (
                          <div className="mt-1">
                            <div className="flex items-center text-sm text-gray-500 mb-1">
                              <FileText className="h-4 w-4 mr-1" />
                              <span>Extracted Text:</span>
                            </div>
                            <div className="bg-base-200 p-2 rounded text-sm max-h-32 overflow-y-auto">
                              {file.text.substring(0, 300)}
                              {file.text.length > 300 && '...'}
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              <div className="flex justify-center mt-8">
                <button 
                  type="submit"
                  className={`btn btn-primary btn-lg px-12 ${uploadStatus.isUploading || processingFiles ? 'loading' : ''}`}
                  disabled={uploadStatus.isUploading || processingFiles}
                >
                  {uploadStatus.isUploading ? 'Submitting...' : processingFiles ? 'Processing Files...' : 'Submit Application'}
                </button>
              </div>
            </form>
          </div>
          {uploadStatus.success && matches.length === 0 && (
            <div className="mt-8 p-6 bg-base-200 rounded-lg shadow-lg text-center">
              <h2 className="text-2xl font-bold text-primary mb-2">No matching trials yet</h2>
              <p className="text-gray-500">
                Your information was submitted successfully, but no open trials match it right
                now. A coordinator will be in touch if that changes.
              </p>
            </div>
          )}

          {matches.length > 0 && (
  <div className="mt-8 p-6 bg-base-200 rounded-lg shadow-lg">
    <h2 className="text-2xl font-bold text-center text-primary mb-4">Matched Trials</h2>
    {matchError && (
      <div role="alert" className="alert alert-error mb-4">
        <X className="stroke-current shrink-0 h-6 w-6" />
        <span>{matchError}</span>
      </div>
    )}
    {explanation && (
      <div className="mb-6 p-4 bg-base-100 rounded-lg border border-base-300">
        <h3 className="font-semibold mb-2">Why these trials?</h3>
        <p className="text-sm text-gray-500 whitespace-pre-line">{explanation}</p>
      </div>
    )}
    <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {matches.map((trialId) => (
        <li key={trialId} className="card bg-base-100 shadow-lg rounded-lg border border-gray-200 p-6">
              {trials[trialId] ? (
                <div>
                  <h3 className="text-lg font-semibold text-primary">
                    {trials[trialId]?.title || "No Title"}
                  </h3>
                  <p className="text-gray-500 text-sm">
                    {trials[trialId]?.description || "No Description"}
                  </p>
                  <button
                    onClick={() => handleMatch(trialId)}
                    disabled={clicked[trialId]}
                    className={`mt-4 btn btn-primary btn-lg w-full ${
                      clicked[trialId] ? "btn-disabled opacity-50 cursor-not-allowed" : ""
                    }`}
                  >
                    {clicked[trialId] ? (
                      <span className="flex items-center">
                        <Check className="w-5 h-5 mr-2" />
                        Matched
                      </span>
                    ) : (
                      "Match"
                    )}
                  </button>
                </div>
              ) : (
                <div className="flex justify-center items-center h-full">
                  <Loader className="w-6 h-6 text-gray-400 animate-spin" />
                  <p className="text-gray-400 ml-2">Loading trial info...</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    )}

        </div>
      </div>
    </div>
  )
}

export default VolunteerApplication
