import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'

const SignUpPage = () => {
    const { signup, authError, isAuthLoading } = useAuthStore()
    const [error, setError] = useState('')

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: ''
    })

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        })
        // Clear error when user starts typing again
        setError('')
    }

    const handleSubmit = async (e) => {
        e.preventDefault()

        // Check if passwords match
        if (formData.password !== formData.confirmPassword) {
            setError('Passwords do not match!')
            return
        }

        // Check if password is empty
        if (!formData.password) {
            setError('Password is required!')
            return
        }

        // Create new object without confirmPassword
        const { confirmPassword, ...signupData } = formData

        await signup(signupData)
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-base-200 p-8">
            <div className="card w-full max-w-4xl bg-base-100 shadow-2xl">
                <div className="card-body p-12">
                    <h2 className="card-title justify-center text-5xl font-bold mb-12">Organization Sign Up</h2>
                    {(error || authError) && (
                        <div role="alert" className="alert alert-error text-lg mb-6">
                            {error || authError}
                        </div>
                    )}
                    <form onSubmit={handleSubmit} className="space-y-8">
                        <div className="form-control">
                            <label className="label">
                                <span className="label-text text-2xl mb-2">Organization Name</span>
                            </label>
                            <input 
                                type="text" 
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                placeholder="Enter organization name" 
                                className="input input-bordered input-lg w-full text-xl py-8" 
                            />
                        </div>
                        <div className="form-control">
                            <label className="label">
                                <span className="label-text text-2xl mb-2">Organization Email</span>
                            </label>
                            <input 
                                type="email" 
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                placeholder="Enter organization email" 
                                className="input input-bordered input-lg w-full text-xl py-8" 
                            />
                        </div>
                        <div className="form-control">
                            <label className="label">
                                <span className="label-text text-2xl mb-2">Password</span>
                            </label>
                            <input 
                                type="password" 
                                name="password"
                                value={formData.password}
                                onChange={handleChange}
                                placeholder="Enter password" 
                                className={`input input-bordered input-lg w-full text-xl py-8 ${error && 'input-error'}`}
                            />
                        </div>
                        <div className="form-control">
                            <label className="label">
                                <span className="label-text text-2xl mb-2">Confirm Password</span>
                            </label>
                            <input 
                                type="password" 
                                name="confirmPassword"
                                value={formData.confirmPassword}
                                onChange={handleChange}
                                placeholder="Confirm your password" 
                                className={`input input-bordered input-lg w-full text-xl py-8 ${error && 'input-error'}`}
                            />
                        </div>
                        <div className="form-control mt-12">
                            <button type="submit" disabled={isAuthLoading} className="btn btn-primary btn-lg text-xl py-8">
                                {isAuthLoading ? 'Creating account...' : 'Sign Up'}
                            </button>
                        </div>
                    </form>
                    <p className="text-center mt-8 text-xl">
                        Already have an account? 
                        <Link to="/login" className="link link-primary ml-3 font-semibold">Login</Link>
                    </p>
                </div>
            </div>
        </div>
    )
}

export default SignUpPage
