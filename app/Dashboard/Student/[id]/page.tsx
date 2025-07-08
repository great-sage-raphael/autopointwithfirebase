"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { 
  doc, 
  getDoc, 
  collection, 
  getDocs, 
  addDoc, 
  query, 
  where 
} from "firebase/firestore";
import { 
  ref, 
  uploadBytes, 
  getDownloadURL 
} from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase";
import { Activity, Award, Book, Calendar, ExternalLink, Download, User } from "lucide-react";
import { CertificateUploadComponent } from "@/app/components/CertificateUploadComponent";
import { CertificateForm } from "@/app/components/CertificateForm";

// Define interfaces for data types
interface UserData {
  class_name: string;
  role: string;
  student_name: string;
  teacher_id?: string; // Add teacher_id field
}

interface TeacherData {
  name: string;
  email: string;
  department?: string;
  phone?: string;
}

interface ActivityData {
  id: string;
  activity_name: string;
  date: string;
  points: number;
  status: string;
  file_url?: string;
  certificate_type?: string;
  issuer?: string;
  description?: string;
}

// Define interface for extracted data
interface ExtractedData {
  certificateName: string;
  certificateType: string;
  issuer: string;
  dateOfIssue: string;
  fileObject: File | null;
  description?: string;
  [key: string]: any;
}

// Define certificate types and points mapping
type CertificateType = 
  | "MOOC" 
  | "Internship" 
  | "Workshop" 
  | "Paper Presentation" 
  | "Tech Fest" 
  | "Sports Event" 
  | "Participation" 
  | "Completion" 
  | "Achievement" 
  | "Appreciation" 
  | "Other";

const StudentDashboard = () => {
  const params = useParams();
  const router = useRouter();
  const userId = params?.id as string;

  const [userData, setUserData] = useState<UserData | null>(null);
  const [activities, setActivities] = useState<ActivityData[]>([]);
  const [teacherData, setTeacherData] = useState<TeacherData | null>(null);
  const [teacherLoading, setTeacherLoading] = useState(false);
  const [teacherError, setTeacherError] = useState<string | null>(null);
  
  // Certificate upload state
  const [showCertificateForm, setShowCertificateForm] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  useEffect(() => {
    const fetchUserData = async () => {
      if (!userId) return;

      try {
        const userDocRef = doc(db, "profiles", userId);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          const data = userDoc.data() as UserData;
          setUserData(data);
          
          // Fetch teacher data if teacher_id exists
          if (data.teacher_id) {
            await fetchTeacherData(data.teacher_id);
          }
        } else {
          console.error("User profile not found");
        }
      } catch (error: any) {
        console.error("Error fetching user data:", error.message);
      }
    };

    fetchUserData();
    fetchActivities();
  }, [userId]);

  // Separate function to fetch teacher data
const fetchTeacherData = async (teacherId: string) => {
  setTeacherLoading(true);
  setTeacherError(null);
  
  try {
    // Query the 'teachers' collection instead of 'profiles'
    const teacherDocRef = doc(db, "teachers", teacherId);
    const teacherDoc = await getDoc(teacherDocRef);
    
    if (teacherDoc.exists()) {
      const data = teacherDoc.data() as TeacherData;
      setTeacherData(data);
    } else {
      // Handle missing teacher gracefully
      setTeacherError("Teacher information not available");
      setTeacherData(null);
      console.warn(`Teacher profile not found for ID: ${teacherId}`);
    }
  } catch (error: any) {
    // Handle any database errors
    setTeacherError("Unable to load teacher information");
    setTeacherData(null);
    console.error("Error fetching teacher data:", error.message);
  } finally {
    setTeacherLoading(false);
  }
};

// Also update the main useEffect to handle cases where teacher_id might be invalid
useEffect(() => {
  const fetchUserData = async () => {
    if (!userId) return;

    try {
      const userDocRef = doc(db, "profiles", userId);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        const data = userDoc.data() as UserData;
        setUserData(data);
        
        // Only fetch teacher data if teacher_id exists and is valid
        if (data.teacher_id && data.teacher_id.trim() !== "") {
          await fetchTeacherData(data.teacher_id);
        } else {
          // No teacher assigned
          setTeacherData(null);
          setTeacherError("No teacher assigned to your profile");
        }
      } else {
        console.error("User profile not found");
      }
    } catch (error: any) {
      console.error("Error fetching user data:", error.message);
    }
  };

  fetchUserData();
  fetchActivities();
}, [userId]);

  // Separate function to fetch activities
  const fetchActivities = async () => {
    if (!userId) return;
    
    try {
      const activitiesRef = collection(db, "activities");
      const activitiesQuery = query(activitiesRef, where("user_id", "==", userId));
      const querySnapshot = await getDocs(activitiesQuery);
      
      const activitiesData: ActivityData[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        activitiesData.push({
          id: doc.id,
          activity_name: data.activity_name,
          date: data.date,
          points: data.points,
          status: data.status,
          file_url: data.file_url || "",
          certificate_type: data.certificate_type || "",
          issuer: data.issuer || "",
          description: data.description || ""
        });
      });
      
      // Sort by date (newest first)
      activitiesData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setActivities(activitiesData);
    } catch (error: any) {
      console.error("Error fetching activities:", error.message);
    }
  };

  // Handle certificate data extraction
  const handleDataExtracted = (data: ExtractedData) => {
    console.log("Data extracted:", data);
    setExtractedData(data);
    setShowCertificateForm(true);
  };

  // Handle form submission
  const handleFormSubmit = async (formData: any) => {
    if (!userId) {
      alert("User ID not found");
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      console.log("Form data received:", formData);
      
      // First upload the certificate file to storage
      let fileUrl = "";
      if (formData.fileObject) {
        console.log("Uploading file:", formData.fileObject.name);
        
        const fileExt = formData.fileObject.name.split('.').pop();
        const fileName = `${userId}_${Date.now()}.${fileExt}`;
        const storageRef = ref(storage, `certificates/${fileName}`);
        
        try {
          // Upload file
          const uploadResult = await uploadBytes(storageRef, formData.fileObject);
          console.log("File uploaded successfully:", uploadResult);
          
          // Get download URL
          fileUrl = await getDownloadURL(uploadResult.ref);
          console.log("File URL:", fileUrl);
        } catch (uploadError: any) {
          console.error("File upload error:", uploadError);
          throw new Error(`File upload failed: ${uploadError.message}`);
        }
      }
      
      // Create activity record
      const activitiesRef = collection(db, "activities");
      const activityData = {
        user_id: userId,
        activity_name: formData.certificateName,
        certificate_type: formData.certificateType,
        issuer: formData.issuer,
        date: formData.dateOfIssue,
        points: calculatePoints(formData.certificateType as CertificateType),
        status: "pending",
        description: formData.description || "",
        file_url: fileUrl,
        created_at: new Date().toISOString()
      };
      
      console.log("Creating activity record:", activityData);
      
      const docRef = await addDoc(activitiesRef, activityData);
      console.log("Activity created with ID:", docRef.id);
      
      // Refresh activities
      await fetchActivities();
      
      // Reset form state
      setExtractedData(null);
      setShowCertificateForm(false);
      
      alert("Certificate submitted successfully!");
    } catch (error: any) {
      console.error("Error submitting certificate:", error);
      alert(`Failed to submit certificate: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle cancelling form
  const handleCancelForm = () => {
    setExtractedData(null);
    setShowCertificateForm(false);
  };
  
  // Calculate points based on certificate type
  const calculatePoints = (certificateType: CertificateType): number => {
    const pointsMap: Record<CertificateType, number> = {
      "MOOC": 15,
      "Internship": 30,
      "Workshop": 10,
      "Paper Presentation": 25,
      "Tech Fest": 20,
      "Sports Event": 15,
      "Participation": 5,
      "Completion": 10,
      "Achievement": 20,
      "Appreciation": 10,
      "Other": 5
    };
    
    return pointsMap[certificateType] || 5;
  };

  // Function to export data to Excel
  const exportToExcel = () => {
    const dataForExcel = activities.map(activity => ({
      Activity: activity.activity_name,
      Date: activity.date,
      Points: activity.points,
      Status: activity.status,
      Certificate_Type: activity.certificate_type,
      Issuer: activity.issuer,
      Description: activity.description,
      File_URL: activity.file_url
    }));
    
    console.log("Data for Excel:", dataForExcel);
    // You can use a library like xlsx or react-excel-export here
  };

  // Handle Logout
  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.push("/");
    } catch (error: any) {
      console.error("Sign out error:", error.message);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFE6E6]">
      {/* Header */}
      <header className="bg-[#7469B6] text-white py-4">
        <div className="container mx-auto px-6">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold">Student Dashboard</h1>
            <div className="flex gap-4">
              <button 
                onClick={exportToExcel}
                className="bg-[#AD88C6] px-4 py-2 rounded-lg hover:bg-[#E1AFD1] transition-colors flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Export to Excel
              </button>
              <button onClick={handleSignOut} className="bg-[#AD88C6] px-4 py-2 rounded-lg hover:bg-[#E1AFD1] transition-colors">
                Sign Out
              </button>
            </div>
          </div>
        </div>
        
        {/* Student Info */}
        {userData && (
          <div className="container mx-auto px-6 mt-4">
            <div className="bg-[#a69be2] p-4 rounded-md">
              <p className="text-lg">
                <span className="font-semibold">Name:</span> {userData.student_name}
              </p>
              <p className="text-lg">
                <span className="font-semibold">Class:</span> {userData.class_name}
              </p>
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        {/* Teacher Info Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <User className="h-6 w-6 text-[#7469B6]" />
            <h2 className="text-xl font-bold text-[#7469B6]">Your Teacher</h2>
          </div>
          
          {teacherLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#7469B6]"></div>
              <span className="ml-2 text-gray-600">Loading teacher information...</span>
            </div>
          ) : teacherError ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-600">{teacherError}</p>
            </div>
          ) : teacherData ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#f8f9fa] p-4 rounded-lg">
                <p className="text-sm font-medium text-gray-500 mb-1">Name</p>
                <p className="text-lg font-semibold text-gray-800">{teacherData.name}</p>
              </div>
              <div className="bg-[#f8f9fa] p-4 rounded-lg">
                <p className="text-sm font-medium text-gray-500 mb-1">Email</p>
                <p className="text-lg font-semibold text-gray-800">{teacherData.email}</p>
              </div>
              {teacherData.department && (
                <div className="bg-[#f8f9fa] p-4 rounded-lg">
                  <p className="text-sm font-medium text-gray-500 mb-1">Department</p>
                  <p className="text-lg font-semibold text-gray-800">{teacherData.department}</p>
                </div>
              )}
              {teacherData.phone && (
                <div className="bg-[#f8f9fa] p-4 rounded-lg">
                  <p className="text-sm font-medium text-gray-500 mb-1">Phone</p>
                  <p className="text-lg font-semibold text-gray-800">{teacherData.phone}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-yellow-700">No teacher assigned to your profile.</p>
            </div>
          )}
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[#7469B6]">Total Points</h3>
              <Award className="h-6 w-6 text-[#7469B6]" />
            </div>
            <p className="text-3xl font-bold text-[#7469B6]">
              {activities.reduce((total, act) => total + act.points, 0)}
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[#7469B6]">Activities</h3>
              <Activity className="h-6 w-6 text-[#7469B6]" />
            </div>
            <p className="text-3xl font-bold text-[#7469B6]">{activities.length}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[#7469B6]">Pending</h3>
              <Calendar className="h-6 w-6 text-[#7469B6]" />
            </div>
            <p className="text-3xl font-bold text-[#7469B6]">
              {activities.filter((act) => act.status === "pending").length}
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[#7469B6]">Approved</h3>
              <Book className="h-6 w-6 text-[#7469B6]" />
            </div>
            <p className="text-3xl font-bold text-[#7469B6]">
              {activities.filter((act) => act.status === "approved").length}
            </p>
          </div>
        </div>

        {/* Recent Activities */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-bold text-[#7469B6] mb-6">Recent Activities</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-3 px-4 text-gray-800">Activity</th>
                  <th className="text-left py-3 px-4 text-gray-800">Date</th>
                  <th className="text-left py-3 px-4 text-gray-800">Points</th>
                  <th className="text-left py-3 px-4 text-gray-800">Status</th>
                  <th className="text-left py-3 px-4 text-gray-800">Certificate</th>
                </tr>
              </thead>  
              <tbody>
                {activities.length > 0 ? (
                  activities.map((activity) => (
                    <tr key={activity.id} className="border-b border-gray-100">
                      <td className="py-3 px-4 text-gray-800">{activity.activity_name}</td>
                      <td className="py-3 px-4 text-gray-800">{activity.date}</td>
                      <td className="py-3 px-4 text-gray-800">{activity.points}</td>
                      <td className="py-3 px-4 text-gray-800">
                        <span className={`px-2 py-1 rounded-full text-sm ${
                          activity.status === "approved" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
                        }`}>
                          {activity.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-800">
                        {activity.file_url ? (
                          <a 
                            href={activity.file_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-[#7469B6] hover:text-[#AD88C6] flex items-center gap-1"
                          >
                            <ExternalLink className="h-4 w-4" />
                            View Certificate
                          </a>
                        ) : (
                          <span className="text-gray-400">No file</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-gray-800">
                      No activities found. Upload your first certificate below!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Upload Certificate Section */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-[#7469B6] mb-6">Upload Certificate</h2>
          
          {!showCertificateForm ? (
            <CertificateUploadComponent onDataExtracted={handleDataExtracted} />
          ) : (
            <div>
              <CertificateForm 
                extractedData={extractedData as ExtractedData} 
                onSubmit={handleFormSubmit}
              />
              <div className="flex gap-4 mt-4">
                <button 
                  onClick={handleCancelForm}
                  className="text-[#7469B6] hover:text-[#AD88C6] px-4 py-2 border border-[#7469B6] rounded-lg"
                  disabled={isSubmitting}
                >
                  ← Back to upload
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default StudentDashboard;