"use client";
import React, { useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword 
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query 
} from 'firebase/firestore';
import { auth, db } from '../../lib/firebase'; // Updated import
import { UserPlus, LogIn } from 'lucide-react';
import { useRouter } from "next/navigation";

interface Teacher {
  id: string;
  name: string;
  email: string;
}

const Auth = () => {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [student_name, setStudentName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student');
  const [class_name, setClassName] = useState('');
  const [teacher_id, setTeacherId] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [availableTeachers, setAvailableTeachers] = useState<Teacher[]>([]);
  const [teacherFetchError, setTeacherFetchError] = useState<string>('');

  useEffect(() => {
    setMessage('');
  }, [isLogin]);

  useEffect(() => {
    const fetchTeachers = async () => {
      if (role === 'student' && !isLogin) {
        setTeacherFetchError('');
        try {
          const teachersRef = collection(db, 'teachers');
          const teachersQuery = query(teachersRef);
          const querySnapshot = await getDocs(teachersQuery);
          

          const validTeachers: Teacher[] = [];
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (data.name && data.email) {
              validTeachers.push({
                id: doc.id,
                name: data.name,
                email: data.email
              });
            }
          });

          setAvailableTeachers(validTeachers);
        } catch (err) {
          console.error('Fetch error:', err);
          setTeacherFetchError('An unexpected error occurred. Please try again.');
          setAvailableTeachers([]);
        }
      }
    };

    fetchTeachers();
  }, [role, isLogin]);

  const handleAuth = async (e: React.FormEvent) => {
  e.preventDefault();
  setIsLoading(true);
  setMessage('');

  // Basic validation
  if (!email.trim() || !password.trim()) {
    setMessage('Email and password are required.');
    setIsLoading(false);
    return;
  }

  if (password.length < 6) {
    setMessage('Password must be at least 6 characters long.');
    setIsLoading(false);
    return;
  }

  // Additional validation for students
  if (!isLogin && role === 'student') {
    if (!class_name.trim()) {
      setMessage('Class name is required for students.');
      setIsLoading(false);
      return;
    }

    if (!teacher_id) {
      setMessage('Please select a teacher.');
      setIsLoading(false);
      return;
    }
  }

  try {
    if (isLogin) {
      // Sign In
      console.log('Attempting sign in with:', { email: email.trim() });
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password.trim());
      const user = userCredential.user;

      if (!user) {
        setMessage('Invalid email or password.');
        setIsLoading(false);
        return;
      }

      console.log('Sign in successful:', user);

      // Wait a moment for auth state to fully propagate
      await new Promise(resolve => setTimeout(resolve, 500));

      try {
        // First check teachers collection
        const teacherDocRef = doc(db, 'teachers', user.uid);
        const teacherDoc = await getDoc(teacherDocRef);

        console.log('Teacher check:', { exists: teacherDoc.exists() });

        if (teacherDoc.exists()) {
          // User is a teacher
          router.push(`/Dashboard/Teacher/${user.uid}`);
          return;
        }
      } catch (teacherError) {
        console.log('Teacher check failed (expected if user is not a teacher):', teacherError);
      }

      try {
        // If not a teacher, check profiles collection
        const profileDocRef = doc(db, 'profiles', user.uid);
        const profileDoc = await getDoc(profileDocRef);

        console.log('Profile check:', { exists: profileDoc.exists() });

        if (!profileDoc.exists()) {
          setMessage('Error: User profile not found');
          setIsLoading(false);
          return;
        }

        const profileData = profileDoc.data();
        if (profileData?.role === 'student') {
          router.push(`/Dashboard/Student/${user.uid}`);
        } else {
          setMessage('Error: Invalid user role');
          setIsLoading(false);
        }
      } catch (profileError) {
        console.error('Profile check failed:', profileError);
        setMessage('Error accessing user profile. Please try again.');
        setIsLoading(false);
      }

    } else {
      // Sign Up
      console.log('Attempting sign up with:', { email: email.trim(), role });
      const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password.trim());
      const user = userCredential.user;

      if (user) {
        try {
          if (role === 'teacher') {
            // Insert into teachers collection
            await setDoc(doc(db, 'teachers', user.uid), {
              name: student_name.trim(),
              email: email.trim(),
              created_at: new Date().toISOString()
            });
          } else {
            // Insert student profile
            await setDoc(doc(db, 'profiles', user.uid), {
              id: user.uid,
              student_name: student_name.trim(),
              role: 'student',
              class_name: class_name.trim(),
              teacher: teacher_id,
              total_activities: 0,
              total_points: 0,
              status: 'active',
              created_at: new Date().toISOString()
            });
          }

          setMessage('Account created successfully! Please verify your email and then log in.');
          setIsLogin(true);
          resetForm();
        } catch (error: any) {
          console.error('Profile creation error:', error);
          setMessage('Error during registration: ' + error.message);
        }
      }
    }
  } catch (error: any) {
    console.error('Authentication error:', error);
    if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
      setMessage('Invalid email or password.');
    } else if (error.code === 'auth/email-already-in-use') {
      setMessage('This email is already registered. Please log in instead.');
    } else {
      setMessage(error.message);
    }
  } finally {
    setIsLoading(false);
  }
};

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setStudentName('');
    setClassName('');
    setTeacherId('');
  };

  const switchMode = () => {
    setIsLogin(!isLogin);
    resetForm();
    setMessage('');
  };

 
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-md mx-auto bg-white/90 p-8 rounded-lg shadow-lg">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-[#866ec7]">
            {isLogin ? 'Welcome Back' : 'Create Account'}
          </h2>
          <p className="text-gray-600 mt-2">
            {isLogin 
              ? 'Sign in to continue' 
              : 'Sign up to get started and verify your email to sign in'}
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-6">
          <div>
            <label className="block text-gray-700 mb-2" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border text-gray-600 rounded-lg focus:outline-none focus:border-[#866ec7]"
              placeholder="your@email.com"
              required
            />
          </div>

          <div>
            <label className="block text-gray-700 mb-2" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border text-gray-700 rounded-lg focus:outline-none focus:border-[#866ec7]"
              placeholder="Minimum 6 characters"
              minLength={6}
              required
            />
          </div>

          {!isLogin && (
            <>
              <div>
                <label className="block text-gray-700 mb-2" htmlFor="student_name">Name</label>
                <input
                  id="student_name"
                  type="text"
                  value={student_name}
                  onChange={(e) => setStudentName(e.target.value)}
                  className="w-full px-4 py-2 border text-gray-600 rounded-lg focus:outline-none focus:border-[#866ec7]"
                  placeholder="Your name"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-700 mb-2" htmlFor="role">Role</label>
                <select
                  id="role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-4 py-2 border text-gray-700 rounded-lg focus:outline-none focus:border-[#866ec7]"
                >
                  <option value="student">Student</option>
                  <option value="teacher">Teacher</option>
                </select>
              </div>

              {role === 'student' && (
                <>
                  <div>
                    <label className="block text-gray-700 mb-2" htmlFor="class_name">Class</label>
                    <input
                      id="class_name"
                      type="text"
                      value={class_name}
                      onChange={(e) => setClassName(e.target.value)}
                      className="w-full px-4 py-2 border text-gray-700 rounded-lg focus:outline-none focus:border-[#866ec7]"
                      placeholder="Enter your class (e.g., csec1, csec2)"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-gray-700 mb-2" htmlFor="teacher_id">
                      Select Teacher
                      {teacherFetchError && (
                        <span className="text-red-500 text-sm ml-2">({teacherFetchError})</span>
                      )}
                    </label>
                    <select
                      id="teacher_id"
                      value={teacher_id}
                      onChange={(e) => setTeacherId(e.target.value)}
                      className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-[#866ec7] ${
                        teacherFetchError ? 'border-red-300' : 'text-gray-700'
                      }`}
                      required
                      disabled={teacherFetchError !== ''}
                    >
                      <option value="">Select a teacher</option>
                      {availableTeachers.map((teacher) => (
                        <option key={teacher.id} value={teacher.id}>
                          {teacher.name} ({teacher.email})
                        </option>
                      ))}
                    </select>
                    {teacherFetchError && (
                      <button
                        type="button"
                        onClick={() => {
                          setTeacherFetchError('');
                          setRole(role); // This will trigger the useEffect to fetch teachers again
                        }}
                        className="mt-2 text-sm text-[#866ec7] hover:underline"
                      >
                        Try loading teachers again
                      </button>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-[#866ec7] text-white py-3 rounded-lg hover:bg-[#bf9fee] transition-colors flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              'Processing...'
            ) : isLogin ? (
              <>
                <LogIn size={20} />
                <span>Sign In</span>
              </>
            ) : (
              <>
                <UserPlus size={20} />
                <span>Create Account</span>
              </>
            )}
          </button>
        </form>

        {message && (
          <div className={`mt-4 p-4 rounded-lg text-center text-sm ${
            message.includes('successfully') 
              ? 'bg-green-100 text-green-700 border border-green-200' 
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {message}
          </div>
        )}

        <div className="mt-6 text-center">
          <button onClick={switchMode} className="text-[#866ec7] hover:underline">
            {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Auth;