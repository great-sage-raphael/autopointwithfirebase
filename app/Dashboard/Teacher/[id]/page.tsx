"use client";
import React, { useState, useEffect } from "react";
import { Users, CheckCircle, XCircle, Clock, FileText, Edit, Eye, ArrowLeft } from "lucide-react";
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc,
  updateDoc, 
  orderBy,

} from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import Table from "@/app/components/Table";
import StatCard from "@/app/components/StatCard";
import Section from "@/app/components/Section";
import { useRouter } from "next/navigation";
import ActivityReportGenerator from "@/app/components/ActivityReportGenerator";

interface Student {
  id: string;
  student_name: string;
  total_activities: number;
  total_points: number;
  status: string;
}

interface Activity {
  id: string;
  user_id?: string;
  student_name?: string;
  activity_name: string;
  date: string;
  points: number;
  status: string;
  file_url?: string;
}

interface Stats {
  totalStudents: number;
  pendingReview: number;
  approved: number;
  rejected: number;
}

export default function TeacherDashboard() {
  const router = useRouter();
  const [students, setStudents] = useState<Student[]>([]);
  const [pendingActivities, setPendingActivities] = useState<Activity[]>([]);
  const [allActivities, setAllActivities] = useState<Activity[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentActivities, setStudentActivities] = useState<Activity[]>([]);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [stats, setStats] = useState<Stats>({
    totalStudents: 0,
    pendingReview: 0,
    approved: 0,
    rejected: 0,
  });
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [teacherName, setTeacherName] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<"dashboard" | "student-details">("dashboard");

  // Initialize auth state listener
useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    if (!user) {
      console.error("No user found");
      router.push('/');
      return;
    }

    try {
      // Get teacher data from Firestore using document ID
      const teacherRef = doc(db, "teachers", user.uid);
      const teacherSnapshot = await getDoc(teacherRef);

      if (!teacherSnapshot.exists()) {
        console.error("No teacher data found");
        router.push('/');
        return;
      }

      const teacherData = teacherSnapshot.data();
      setTeacherId(user.uid); // Use the user's UID as teacher ID
      setTeacherName(teacherData.name || teacherData.teacher_name || "Teacher");

      // Load initial data
      await loadTeacherData(user.uid);
      setIsLoading(false);
    } catch (error) {
      console.error("Error loading teacher data:", error);
      setIsLoading(false);
    }
  });

  return unsubscribe;
}, [router]);

  const loadTeacherData = async (teacherId: string) => {
    try {
      await Promise.all([
        fetchStats(teacherId),
        fetchStudents(teacherId),
        fetchPendingActivities(teacherId),
        fetchAllActivities(teacherId)
      ]);
    } catch (error) {
      console.error("Error loading teacher data:", error);
    }
  };

  const fetchStats = async (teacherId: string) => {
    if (!teacherId) return;

    try {
      // Get all student profiles for this teacher
      const profilesRef = collection(db, "profiles");
      const studentQuery = query(
        profilesRef,
        where("teacher_id", "==", teacherId),
        where("role", "==", "student")
      );
      const studentSnapshot = await getDocs(studentQuery);

      if (studentSnapshot.empty) {
        setStats({
          totalStudents: 0,
          pendingReview: 0,
          approved: 0,
          rejected: 0,
        });
        return;
      }

      // Extract student IDs
      const studentIds = studentSnapshot.docs.map(doc => doc.data().id);
      const totalStudents = studentSnapshot.size;

      // Count activities by status
      const activitiesRef = collection(db, "activities");
      
      // Split into smaller chunks if needed (Firestore 'in' query limit is 10)
      const chunks = [];
      for (let i = 0; i < studentIds.length; i += 10) {
        chunks.push(studentIds.slice(i, i + 10));
      }

      let pendingCount = 0;
      let approvedCount = 0;
      let rejectedCount = 0;

      for (const chunk of chunks) {
        const [pendingSnapshot, approvedSnapshot, rejectedSnapshot] = await Promise.all([
          getDocs(query(activitiesRef, where("user_id", "in", chunk), where("status", "==", "pending"))),
          getDocs(query(activitiesRef, where("user_id", "in", chunk), where("status", "==", "approved"))),
          getDocs(query(activitiesRef, where("user_id", "in", chunk), where("status", "==", "rejected")))
        ]);

        pendingCount += pendingSnapshot.size;
        approvedCount += approvedSnapshot.size;
        rejectedCount += rejectedSnapshot.size;
      }

      setStats({
        totalStudents,
        pendingReview: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  const fetchStudents = async (teacherId: string) => {
    if (!teacherId) return;

    try {
      const profilesRef = collection(db, "profiles");
      const studentQuery = query(
        profilesRef,
        where("teacher_id", "==", teacherId),
        where("role", "==", "student")
      );
      const snapshot = await getDocs(studentQuery);
      
      const studentsData = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: data.id,
          student_name: data.student_name,
          total_activities: data.total_activities || 0,
          total_points: data.total_points || 0,
          status: data.status || "active"
        };
      });

      setStudents(studentsData);
    } catch (error) {
      console.error("Error fetching students:", error);
    }
  };

  const fetchPendingActivities = async (teacherId: string) => {
    if (!teacherId) return;

    try {
      // First, get all student profiles for this teacher
      const profilesRef = collection(db, "profiles");
      const studentQuery = query(
        profilesRef,
        where("teacher_id", "==", teacherId),
        where("role", "==", "student")
      );
      const studentSnapshot = await getDocs(studentQuery);

      if (studentSnapshot.empty) {
        setPendingActivities([]);
        return;
      }

      // Extract student IDs and create a map of student names
      const studentIds: string[] = [];
      const studentNamesMap = new Map<string, string>();
      
      studentSnapshot.docs.forEach(doc => {
        const data = doc.data();
        studentIds.push(data.id);
        studentNamesMap.set(data.id, data.student_name);
      });

      // Handle chunks for 'in' query limitation
      const chunks = [];
      for (let i = 0; i < studentIds.length; i += 10) {
        chunks.push(studentIds.slice(i, i + 10));
      }

      const allActivities: Activity[] = [];
      
      for (const chunk of chunks) {
        const activitiesRef = collection(db, "activities");
        const activitiesQuery = query(
          activitiesRef,
          where("user_id", "in", chunk),
          where("status", "==", "pending")
        );
        const activitiesSnapshot = await getDocs(activitiesQuery);

        const activitiesWithNames = activitiesSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            user_id: data.user_id,
            student_name: studentNamesMap.get(data.user_id) || "Unknown Student",
            activity_name: data.activity_name,
            date: data.date,
            points: data.points,
            status: data.status,
            file_url: data.file_url
          };
        });

        allActivities.push(...activitiesWithNames);
      }

      setPendingActivities(allActivities);
    } catch (error) {
      console.error("Error in fetchPendingActivities:", error);
    }
  };

  const fetchAllActivities = async (teacherId: string) => {
    if (!teacherId) return;

    try {
      // Get all student profiles for this teacher
      const profilesRef = collection(db, "profiles");
      const studentQuery = query(
        profilesRef,
        where("teacher_id", "==", teacherId),
        where("role", "==", "student")
      );
      const studentSnapshot = await getDocs(studentQuery);

      if (studentSnapshot.empty) {
        setAllActivities([]);
        return;
      }

      // Extract student IDs and create a map of student names
      const studentIds: string[] = [];
      const studentNamesMap = new Map<string, string>();
      
      studentSnapshot.docs.forEach(doc => {
        const data = doc.data();
        studentIds.push(data.id);
        studentNamesMap.set(data.id, data.student_name);
      });

      // Handle chunks for 'in' query limitation
      const chunks = [];
      for (let i = 0; i < studentIds.length; i += 10) {
        chunks.push(studentIds.slice(i, i + 10));
      }

      const allActivities: Activity[] = [];
      
      for (const chunk of chunks) {
        const activitiesRef = collection(db, "activities");
        const activitiesQuery = query(
          activitiesRef,
          where("user_id", "in", chunk),
          orderBy("date", "desc")
        );
        const activitiesSnapshot = await getDocs(activitiesQuery);

        const activitiesWithNames = activitiesSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            user_id: data.user_id,
            student_name: studentNamesMap.get(data.user_id) || "Unknown Student",
            activity_name: data.activity_name,
            date: data.date,
            points: data.points,
            status: data.status,
            file_url: data.file_url
          };
        });

        allActivities.push(...activitiesWithNames);
      }

      // Sort all activities by date
      allActivities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      setAllActivities(allActivities);
    } catch (error) {
      console.error("Error in fetchAllActivities:", error);
    }
  };

  const fetchStudentActivities = async (studentId: string) => {
    try {
      const activitiesRef = collection(db, "activities");
      const activitiesQuery = query(
        activitiesRef,
        where("user_id", "==", studentId),
        orderBy("date", "desc")
      );
      const snapshot = await getDocs(activitiesQuery);

      const activitiesData = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          activity_name: data.activity_name,
          date: data.date,
          points: data.points,
          status: data.status,
          file_url: data.file_url
        };
      });

      setStudentActivities(activitiesData);
    } catch (error) {
      console.error("Error fetching student activities:", error);
      setStudentActivities([]);
    }
  };

  const handleApprove = async (activityId: string) => {
    try {
      const activityRef = doc(db, "activities", activityId);
      await updateDoc(activityRef, {
        status: "approved"
      });

      // Refresh data
      if (teacherId) {
        await loadTeacherData(teacherId);

        // If we're in student view, refresh that student's activities
        if (selectedStudent) {
          await fetchStudentActivities(selectedStudent.id);
        }
      }
    } catch (error) {
      console.error("Error approving activity:", error);
    }
  };

  const handleReject = async (activityId: string) => {
    try {
      const activityRef = doc(db, "activities", activityId);
      await updateDoc(activityRef, {
        status: "rejected"
      });

      // Refresh data
      if (teacherId) {
        await loadTeacherData(teacherId);

        // If we're in student view, refresh that student's activities
        if (selectedStudent) {
          await fetchStudentActivities(selectedStudent.id);
        }
      }
    } catch (error) {
      console.error("Error rejecting activity:", error);
    }
  };

  const handleViewStudent = async (student: Student) => {
    setSelectedStudent(student);
    await fetchStudentActivities(student.id);
    setView("student-details");
  };

  const handleBackToDashboard = () => {
    setSelectedStudent(null);
    setStudentActivities([]);
    setView("dashboard");
  };

  const handleEditActivity = (activity: Activity) => {
    setEditingActivity(activity);
  };

  const handleSaveActivityEdit = async () => {
    if (!editingActivity) return;

    try {
      const activityRef = doc(db, "activities", editingActivity.id);
      await updateDoc(activityRef, {
        points: editingActivity.points
      });

      // Reset editing state
      setEditingActivity(null);

      // Refresh data
      if (teacherId) {
        await fetchAllActivities(teacherId);

        // If we're in student view, refresh that student's activities
        if (selectedStudent) {
          await fetchStudentActivities(selectedStudent.id);
        }
      }
    } catch (error) {
      console.error("Error updating activity points:", error);
    }
  };

  const handleCancelEdit = () => {
    setEditingActivity(null);
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.push("/");
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  const renderCertificateLink = (fileUrl: string | undefined) => {
    if (!fileUrl) return "No certificate";

    return (
      <a
        href={fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 hover:underline flex items-center gap-1"
      >
        <FileText size={16} />
        View Certificate
      </a>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FFE6E6] flex items-center justify-center">
        <div className="text-[#7469B6] text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFE6E6]">
      <header className="bg-[#7469B6] text-white py-4">
        <div className="container mx-auto px-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Teacher Dashboard</h1>
            <p className="text-sm opacity-90">
              {teacherName ? `Welcome, ${teacherName}` : 'Welcome'}
            </p>
          </div>
          <button
            className="bg-[#AD88C6] px-4 py-2 rounded-lg hover:bg-[#E1AFD1] transition-colors"
            onClick={handleSignOut}
          >
            Sign Out
          </button>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        {view === "dashboard" ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <StatCard title="Total Students" value={stats.totalStudents} Icon={Users} />
              <StatCard title="Pending Review" value={stats.pendingReview} Icon={Clock} />
              <StatCard title="Approved" value={stats.approved} Icon={CheckCircle} />
              <StatCard title="Rejected" value={stats.rejected} Icon={XCircle} />
            </div>

            <Section title="Students">
              {students.length > 0 ? (
                <Table
                  headers={["Name", "Total Activities", "Total Points", "Status", "Actions"]}
                  data={students.map((student) => [
                    student.student_name,
                    student.total_activities,
                    student.total_points,
                    <span key={`status-${student.id}`} className={`px-2 py-1 rounded-full text-xs ${
                      student.status === "active" ? "bg-green-100 text-green-800" : 
                      student.status === "inactive" ? "bg-gray-100 text-gray-800" : 
                      "bg-yellow-100 text-yellow-800"
                    }`}>
                      {student.status}
                    </span>,
                    <button 
                      key={`view-${student.id}`}
                      onClick={() => handleViewStudent(student)} 
                      className="bg-[#AD88C6] text-white px-3 py-1 rounded hover:bg-[#7469B6] flex items-center gap-1"
                    >
                      <Eye size={16} />
                      View Details
                    </button>,
                  ])}
                />
              ) : (
                <div className="text-center py-8 text-gray-600">
                  No students found
                </div>
              )}
            </Section>

            <div className="mb-8">
              <ActivityReportGenerator />
            </div>

            <Section title="Pending Activities">
              {pendingActivities.length > 0 ? (
                <Table
                  headers={["Student", "Activity", "Date", "Points", "Certificate", "Actions"]}
                  data={pendingActivities.map((activity) => [
                    activity.student_name,
                    activity.activity_name,
                    activity.date,
                    activity.points,
                    renderCertificateLink(activity.file_url),
                    <div className="flex space-x-2" key={activity.id}>
                      <button 
                        onClick={() => handleApprove(activity.id)} 
                        className="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600 flex items-center gap-1"
                      >
                        <CheckCircle size={16} />
                        Approve
                      </button>
                      <button 
                        onClick={() => handleReject(activity.id)} 
                        className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 flex items-center gap-1"
                      >
                        <XCircle size={16} />
                        Reject
                      </button>
                    </div>,
                  ])}
                />
              ) : (
                <div className="text-center py-8 text-gray-600">
                  No pending activities to review
                </div>
              )}
            </Section>

            <Section title="All Activities">
              {allActivities.length > 0 ? (
                <Table
                  headers={["Student", "Activity", "Date", "Points", "Status", "Certificate", "Actions"]}
                  data={allActivities.map((activity) => [
                    activity.student_name,
                    activity.activity_name,
                    activity.date,
                    editingActivity?.id === activity.id ? (
                      <input
                        type="number"
                        value={editingActivity.points}
                        onChange={(e) => setEditingActivity({
                          ...editingActivity,
                          points: parseInt(e.target.value) || 0
                        })}
                        className="w-20 p-1 border rounded"
                      />
                    ) : (
                      activity.points
                    ),
                    <span key={`status-${activity.id}`} className={`px-2 py-1 rounded-full text-xs ${
                      activity.status === "approved" ? "bg-green-100 text-green-800" : 
                      activity.status === "rejected" ? "bg-red-100 text-red-800" : 
                      "bg-yellow-100 text-yellow-800"
                    }`}>
                      {activity.status}
                    </span>,
                    renderCertificateLink(activity.file_url),
                    editingActivity?.id === activity.id ? (
                      <div className="flex space-x-2" key={`edit-actions-${activity.id}`}>
                        <button
                          onClick={handleSaveActivityEdit}
                          className="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600"
                        >
                          Save
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="bg-gray-500 text-white px-3 py-1 rounded hover:bg-gray-600"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        key={`edit-${activity.id}`}
                        onClick={() => handleEditActivity(activity)}
                        className="bg-[#AD88C6] text-white px-3 py-1 rounded hover:bg-[#7469B6] flex items-center gap-1"
                      >
                        <Edit size={16} />
                        Edit Points
                      </button>
                    ),
                  ])}
                />
              ) : (
                <div className="text-center py-8 text-gray-600">
                  No activities found
                </div>
              )}
            </Section>
          </>
        ) : (
          <>
            <div className="mb-6 flex items-center">
              <button
                onClick={handleBackToDashboard}
                className="bg-[#AD88C6] text-white px-4 py-2 rounded-lg hover:bg-[#7469B6] transition-colors flex items-center gap-2 mb-4"
              >
                <ArrowLeft size={16} />
                Back to Dashboard
              </button>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <div className="flex items-center gap-4 mb-4">
                <div className="bg-[#7469B6] text-white p-4 rounded-lg">
                  <Users size={24} />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-[#7469B6]">{selectedStudent?.student_name}</h2>
                  <div className="flex gap-6 mt-2">
                    <p className="text-gray-600">
                      <span className="font-semibold">Total Activities:</span> {selectedStudent?.total_activities}
                    </p>
                    <p className="text-gray-600">
                      <span className="font-semibold">Total Points:</span> {selectedStudent?.total_points}
                    </p>
                    <p className="text-gray-600">
                      <span className="font-semibold">Status:</span> 
                      <span className={`ml-1 px-2 py-1 rounded-full text-xs ${
                        selectedStudent?.status === "active" ? "bg-green-100 text-green-800" : 
                        selectedStudent?.status === "inactive" ? "bg-gray-100 text-gray-800" : 
                        "bg-yellow-100 text-yellow-800"
                      }`}>
                        {selectedStudent?.status}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <Section title="Student Activities">
              {studentActivities.length > 0 ? (
                <Table
                  headers={["Activity", "Date", "Points", "Status", "Certificate", "Actions"]}
                  data={studentActivities.map((activity) => [
                    activity.activity_name,
                    activity.date,
                    editingActivity?.id === activity.id ? (
                      <input
                        type="number"
                        value={editingActivity.points}
                        onChange={(e) => setEditingActivity({
                          ...editingActivity,
                          points: parseInt(e.target.value) || 0
                        })}
                        className="w-20 p-1 border rounded"
                      />
                    ) : (
                      activity.points
                    ),
                    <span key={`status-${activity.id}`} className={`px-2 py-1 rounded-full text-xs ${
                      activity.status === "approved" ? "bg-green-100 text-green-800" : 
                      activity.status === "rejected" ? "bg-red-100 text-red-800" : 
                      "bg-yellow-100 text-yellow-800"
                    }`}>
                      {activity.status}
                    </span>,
                    renderCertificateLink(activity.file_url),
                    activity.status === "pending" ? (
                      <div className="flex space-x-2" key={`pending-actions-${activity.id}`}>
                        <button 
                          onClick={() => handleApprove(activity.id)} 
                          className="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600 flex items-center gap-1"
                        >
                          <CheckCircle size={16} />
                          Approve
                        </button>
                        <button 
                          onClick={() => handleReject(activity.id)} 
                          className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 flex items-center gap-1"
                        >
                          <XCircle size={16} />
                          Reject
                        </button>
                      </div>
                    ) : (
                      editingActivity?.id === activity.id ? (
                        <div className="flex space-x-2" key={`edit-actions-${activity.id}`}>
                          <button
                            onClick={handleSaveActivityEdit}
                            className="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600"
                          >
                            Save
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="bg-gray-500 text-white px-3 py-1 rounded hover:bg-gray-600"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          key={`edit-${activity.id}`}
                          onClick={() => handleEditActivity(activity)}
                          className="bg-[#AD88C6] text-white px-3 py-1 rounded hover:bg-[#7469B6] flex items-center gap-1"
                        >
                          <Edit size={16} />
                          Edit Points
                        </button>
                      )
                    ),
                  ])}
                />
              ) : (
                <div className="text-center py-8 text-gray-600">
                  No activities found for this student
                </div>
              )}
            </Section>
          </>
        )}
      </main>
    </div>
  );
}