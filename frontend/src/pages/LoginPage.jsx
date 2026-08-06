import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'

const LoginPage = () => {

    const {login, authError, isAuthLoading} = useAuthStore()

    const [formData, setFormData] = useState({
        email: '',
        password: ''
    })

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        })
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        await login(formData)
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-base-200 p-8">
            <div className="card w-full max-w-4xl bg-base-100 shadow-2xl">
                <div className="card-body p-12">
                    <h2 className="card-title justify-center text-5xl font-bold mb-12">Organization Login</h2>
                    {authError && (
                        <div role="alert" className="alert alert-error text-xl mb-6">
                            <span>{authError}</span>
                        </div>
                    )}
                    <form onSubmit={handleSubmit} className="space-y-8">
                        <div className="form-control">
                            <label className="label">
                                <span className="label-text text-2xl mb-2">Organization Email</span>
                            </label>
                            <input 
                                type="email" 
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                placeholder="Enter your email" 
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
                                placeholder="Enter your password" 
                                className="input input-bordered input-lg w-full text-xl py-8" 
                            />
                        </div>
                        <div className="form-control mt-12">
                            <button type="submit" disabled={isAuthLoading} className="btn btn-primary btn-lg text-xl py-8">
                                {isAuthLoading ? 'Logging in...' : 'Login'}
                            </button>
                        </div>
                    </form>
                    <p className="text-center mt-8 text-xl">
                        Don't have an account? 
                        <Link to="/signup" className="link link-primary ml-3 font-semibold">Sign up</Link>
                    </p>
                </div>
            </div>
        </div>
    )
}

export default LoginPage
