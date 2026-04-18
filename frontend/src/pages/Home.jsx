import React from 'react'

const Home = () => {
  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="bg-gradient-to-r from-indigo-500 to-blue-500 text-white rounded-lg p-6 shadow space-y-3">
        <h1 className="text-2xl font-semibold">Welcome to DormSys</h1>
        <p className="text-sm text-indigo-100">
          Our residence is located at Mahanakorn University of Technology.
        </p>
        <p className="text-sm text-indigo-100">
          Rooms are available for rent in both Building A and Building B with daily stays starting at 600 baht and monthly stays starting at 8,000 baht.
        </p>
        <p className="text-sm text-indigo-100">
          Contact 021234567 for more details.
        </p>
      </div>
    </div>
  )
}

export default Home
