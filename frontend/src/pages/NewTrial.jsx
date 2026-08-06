import React, { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore' 
import { axiosInstance } from '../lib/axios'
import { AlertCircle } from 'lucide-react'

const NewTrial = () => {
    const navigate = useNavigate()
    const { authOrg } = useAuthStore()
    const selectRef = useRef(null)
    const [formData, setFormData] = useState({
        title: '',
        contactName: '',
        contactPhone: '',
        description: '',
        startDate: '',
        endDate: '',
        location: '',
        compensation: '',
        eligibilityCriteria: []
    })
    const [selectedCriteria, setSelectedCriteria] = useState([])
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(false)

    const handleInputChange = (e) => {
        const { name, value } = e.target
        setFormData({
            ...formData,
            [name]: value
        })
        // Clear any errors when user makes changes
        if (error) setError(null)
    }

    const handlePhoneChange = (e) => {
        const value = e.target.value
        if (value === '' || /^[0-9\b]+$/.test(value)) {
            setFormData({
                ...formData,
                contactPhone: value
            })
        }
        // Clear any errors when user makes changes
        if (error) setError(null)
    }

    const handleCriteriaChange = (e) => {
        const value = e.target.value
        if (value && !selectedCriteria.includes(value)) {
            const newCriteria = [...selectedCriteria, value]
            setSelectedCriteria(newCriteria)
            setFormData({
                ...formData,
                eligibilityCriteria: newCriteria
            })
            // Reset the dropdown to default option
            if (selectRef.current) {
                selectRef.current.value = ""
            }
        }
        // Clear any errors when user makes changes
        if (error) setError(null)
    }

    const handleReset = () => {
        setFormData({
            title: '',
            contactName: '',
            contactPhone: '',
            description: '',
            startDate: '',
            endDate: '',
            location: '',
            compensation: '',
            eligibilityCriteria: []
        });
        setSelectedCriteria([]);
        setError(null);
        setSuccess(false);
        // Reset the dropdown to default option
        if (selectRef.current) {
            selectRef.current.value = ""
        }
    }

    const validateForm = () => {
        const requiredFields = ['title', 'contactName', 'contactPhone', 'description', 'startDate', 'endDate', 'location']
        const missingFields = requiredFields.filter(field => !formData[field])
        
        if (missingFields.length > 0) {
            const fieldNames = missingFields.map(field => {
                switch(field) {
                    case 'title': return 'Trial Title';
                    case 'contactName': return 'Contact Name';
                    case 'contactPhone': return 'Contact Phone';
                    case 'description': return 'Description';
                    case 'startDate': return 'Start Date';
                    case 'endDate': return 'End Date';
                    case 'location': return 'Location';
                    default: return field;
                }
            });
            setError(`Please fill in the following required fields: ${fieldNames.join(', ')}`);
            return false;
        }

        if (new Date(formData.startDate) > new Date(formData.endDate)) {
            setError('End date cannot be before start date');
            return false;
        }

        return true;
    }

    const handleSubmit = async () => {
        if (!validateForm()) return;
        
        // Check if user is authenticated and has an organization ID
        if (!authOrg || !authOrg.id) {
            setError('You must be logged in to create a trial');
            return;
        }
        
        setIsSubmitting(true);
        setError(null);
        
        try {
            // Prepare data for API call by adding the organization ID
            const trialData = {
                ...formData,
                org_ID: authOrg.id
            };

            await axiosInstance.post('/trials', trialData);
            setSuccess(true);

            // The dashboard is rendered at "/" for a logged-in org; there is no
            // "/dashboard" route, so the old redirect landed on a blank page.
            setTimeout(() => {
                navigate('/');
            }, 2000);
        } catch (err) {
            const errorMessage = err.response?.data?.detail || 'Failed to create trial. Please try again.';
            console.error('Error creating trial:', err);
            setError(errorMessage);
        } finally {
            setIsSubmitting(false);
        }
    }

    const handleReturn = () => {
        navigate(-1) // Go back to the previous page
    }

    return (
        <div className="h-screen flex flex-col" style={{ overflow: 'hidden' }}>
            <div className="flex-grow bg-base-200 pt-2 pb-16" style={{ overflow: 'hidden' }}>
                <div className="container mx-auto px-4 h-full" style={{ overflow: 'hidden' }}>
                    {/* Success message */}
                    {success && (
                        <div className="alert alert-success mb-4">
                            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <span>Trial created successfully! Redirecting to dashboard...</span>
                        </div>
                    )}
                    
                    {/* Error message */}
                    {error && (
                        <div className="alert alert-error mb-4">
                            <AlertCircle className="h-6 w-6" />
                            <span>{error}</span>
                        </div>
                    )}
                    
                    <div className="grid grid-cols-4 gap-8 max-w-8xl w-full h-full" style={{ overflow: 'hidden' }}>
                        <div className="col-span-2 flex flex-col gap-4 h-full" style={{ overflow: 'hidden' }}>
                            {/* Trial Title */}
                            <div className="card bg-base-100 shadow-xl" style={{ overflow: 'hidden' }}>
                                <div className="card-body p-4" style={{ overflow: 'hidden' }}>
                                    <h2 className="card-title justify-center text-2xl font-bold mb-2">Trial Information</h2>
                                    <div className="flex gap-4" style={{ overflow: 'hidden' }}>
                                        <div className="flex-1" style={{ overflow: 'hidden' }}>
                                            <fieldset className="border rounded-lg p-3" style={{ overflow: 'hidden' }}>
                                                <legend className="text-lg font-semibold px-2">Trial Title</legend>
                                                <input 
                                                    type="text" 
                                                    name="title"
                                                    className="input input-bordered input-md w-full text-md py-1" 
                                                    placeholder="Enter trial title"
                                                    value={formData.title}
                                                    onChange={handleInputChange}
                                                />
                                            </fieldset>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Contact Information */}
                            <div className="card bg-base-100 shadow-xl" style={{ overflow: 'hidden' }}>
                                <div className="card-body p-4" style={{ overflow: 'hidden' }}>
                                    <h2 className="card-title justify-center text-2xl font-bold mb-2">Contact Information</h2>
                                    <div className="flex gap-4" style={{ overflow: 'hidden' }}>
                                        <div className="flex-1" style={{ overflow: 'hidden' }}>
                                            <fieldset className="border rounded-lg p-3" style={{ overflow: 'hidden' }}>
                                                <legend className="text-lg font-semibold px-2">Contact Person</legend>
                                                <input 
                                                    type="text" 
                                                    name="contactName"
                                                    className="input input-bordered input-md w-full text-md py-1" 
                                                    placeholder="Contact Name"
                                                    value={formData.contactName}
                                                    onChange={handleInputChange}
                                                />
                                            </fieldset>
                                        </div>
                                        <div className="flex-1" style={{ overflow: 'hidden' }}>
                                            <fieldset className="border rounded-lg p-3" style={{ overflow: 'hidden' }}>
                                                <legend className="text-lg font-semibold px-2">Contact Phone</legend>
                                                <input 
                                                    type="tel"
                                                    name="contactPhone"
                                                    pattern="[0-9]*"
                                                    inputMode="numeric"
                                                    className="input input-bordered input-md w-full text-md py-1" 
                                                    placeholder="Contact Number"
                                                    value={formData.contactPhone}
                                                    onChange={handlePhoneChange}
                                                />
                                            </fieldset>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Time, Location and Compensation */}
                            <div className="card bg-base-100 shadow-xl" style={{ overflow: 'hidden' }}>
                                <div className="card-body p-4" style={{ overflow: 'hidden' }}>
                                    <h2 className="card-title justify-center text-2xl font-bold mb-2">Trial Details</h2>
                                    <div className="grid grid-cols-2 gap-4" style={{ overflow: 'hidden' }}>
                                        <div style={{ overflow: 'hidden' }}>
                                            <fieldset className="border rounded-lg p-3" style={{ overflow: 'hidden' }}>
                                                <legend className="text-lg font-semibold px-2">Start Date</legend>
                                                <input 
                                                    type="date" 
                                                    name="startDate"
                                                    className="input input-bordered input-md w-full text-md py-1" 
                                                    value={formData.startDate}
                                                    onChange={handleInputChange}
                                                />
                                            </fieldset>
                                        </div>
                                        <div style={{ overflow: 'hidden' }}>
                                            <fieldset className="border rounded-lg p-3" style={{ overflow: 'hidden' }}>
                                                <legend className="text-lg font-semibold px-2">End Date</legend>
                                                <input 
                                                    type="date" 
                                                    name="endDate"
                                                    className="input input-bordered input-md w-full text-md py-1" 
                                                    value={formData.endDate}
                                                    onChange={handleInputChange}
                                                />
                                            </fieldset>
                                        </div>
                                        <div style={{ overflow: 'hidden' }}>
                                            <fieldset className="border rounded-lg p-3" style={{ overflow: 'hidden' }}>
                                                <legend className="text-lg font-semibold px-2">Location</legend>
                                                <input 
                                                    type="text" 
                                                    name="location"
                                                    className="input input-bordered input-md w-full text-md py-1" 
                                                    placeholder="Enter location"
                                                    value={formData.location}
                                                    onChange={handleInputChange}
                                                />
                                            </fieldset>
                                        </div>
                                        <div style={{ overflow: 'hidden' }}>
                                            <fieldset className="border rounded-lg p-3" style={{ overflow: 'hidden' }}>
                                                <legend className="text-lg font-semibold px-2">Compensation</legend>
                                                <input 
                                                    type="text" 
                                                    name="compensation"
                                                    className="input input-bordered input-md w-full text-md py-1" 
                                                    placeholder="e.g. $500, Gift Cards"
                                                    value={formData.compensation}
                                                    onChange={handleInputChange}
                                                />
                                            </fieldset>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Eligibility */}
                            <div className="card bg-base-100 shadow-xl flex-grow" style={{ overflow: 'hidden' }}>
                                <div className="card-body p-4" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                    <h2 className="card-title justify-center text-2xl font-bold mb-2">Eligibility</h2>
                                    <div className="flex gap-4 flex-grow" style={{ overflow: 'hidden' }}>
                                        <div className="flex-1" style={{ overflow: 'hidden', maxWidth: '40%' }}>
                                            <fieldset className="border rounded-lg p-3 h-full" style={{ overflow: 'hidden' }}>
                                                <legend className="text-lg font-semibold px-2">Including</legend>
                                                <select 
                                                    ref={selectRef}
                                                    className="select select-bordered w-full text-md py-1"
                                                    onChange={handleCriteriaChange}
                                                    defaultValue=""
                                                >
                                                    <option value="">Select an option</option>
                                                    <option value="Over 18">Over 18</option>
                                                    <option value="Under 75">Under 75</option>
                                                    <option value="Not Pregnant or Breastfeeding">Not Pregnant or Breastfeeding </option>
                                                    <option value="Non Smoker">Non Smoker</option>
                                                    <option value="Not on Medication">Not on Medication</option>
                                                    <option value="BMI Over 18.5">BMI Over 18.5</option>
                                                    <option value="BMI Under 30">BMI Under 30</option>
                                                    <option value="No Chronic Illnesses">No Chronic Illnesses</option>
                                                    <option value="No Substance Abuse History">No Substance Abuse History</option>
                                                </select>
                                            </fieldset>
                                        </div>
                                        <div className="flex-1" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', flexGrow: 2 }}>
                                            <fieldset className="border rounded-lg p-3 flex-grow" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                                <legend className="text-lg font-semibold px-2">Selected Criteria</legend>
                                                <div className="flex-grow" style={{ overflowY: 'auto' }}>
                                                    <ul className="list-disc pl-5">
                                                        {selectedCriteria.map((criteria, index) => (
                                                            <li key={index} className="text-md">{criteria}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            </fieldset>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        {/* Description */}
                        <div className="col-span-2 h-full" style={{ overflow: 'hidden' }}>
                            <div className="card bg-base-100 shadow-xl h-full" style={{ overflow: 'hidden' }}>
                                <div className="card-body p-6 flex flex-col" style={{ overflow: 'hidden' }}>
                                    <h2 className="card-title justify-center text-2xl font-bold mb-2">Description</h2>
                                    <div className="flex gap-4 flex-grow" style={{ overflow: 'hidden' }}>
                                        <div className="flex-1 flex flex-col" style={{ overflow: 'hidden' }}>
                                            <fieldset className="border rounded-lg p-3 flex-grow flex flex-col" style={{ overflow: 'hidden' }}>
                                                <legend className="text-lg font-semibold px-2">Description</legend>
                                                <textarea 
                                                    name="description"
                                                    className="textarea textarea-bordered w-full text-md py-1 flex-grow"
                                                    placeholder="Enter detailed description of the trial here..."
                                                    value={formData.description}
                                                    onChange={handleInputChange}
                                                    style={{ resize: 'none' }}
                                                />
                                            </fieldset>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            {/* Stationary buttons without a bar */}
            <div className="fixed bottom-4 right-4 flex gap-4">
                <button 
                    onClick={handleReturn}
                    className="btn btn-outline"
                    disabled={isSubmitting}
                >
                    Back
                </button>
                <button 
                    onClick={handleReset}
                    className="btn btn-error"
                    disabled={isSubmitting}
                >
                    Reset
                </button>
                <button 
                    onClick={handleSubmit}
                    className={`btn btn-primary ${isSubmitting ? 'loading' : ''}`}
                    disabled={isSubmitting}
                >
                    {isSubmitting ? 'Creating...' : 'Submit'}
                </button>
            </div>
        </div>
    )
}

export default NewTrial
