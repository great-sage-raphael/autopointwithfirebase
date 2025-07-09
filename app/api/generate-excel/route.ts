import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import admin from 'firebase-admin';

// Initialize Firebase Admin SDK (do this once in your app)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

export async function GET(req: NextRequest) {
  try {
    // Extract query parameters
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('studentId');
    const sortBy = searchParams.get('sortBy') || 'date';
    const fromYear = searchParams.get('fromYear');
    const toYear = searchParams.get('toYear');
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    console.log('Generating Excel report with params:', { studentId, sortBy, fromYear, toYear, sortOrder });

    // Build query step by step
    let activitiesQuery = db.collection('activities').where('status', '==', 'approved');
    
    // Filter by student if studentId is provided
    if (studentId) {
      activitiesQuery = activitiesQuery.where('user_id', '==', studentId);
    }

    // Filter by year range if both fromYear and toYear are provided
    if (fromYear && toYear) {
      const fromDate = `01-01-${fromYear}`;
      const toDate = `12-31-${toYear}`;
      activitiesQuery = activitiesQuery.where('date', '>=', fromDate).where('date', '<=', toDate);
    }

    // Apply sorting
    const order = ['asc', 'desc'].includes(sortOrder.toLowerCase()) ? sortOrder.toLowerCase() : 'desc';
    activitiesQuery = activitiesQuery.orderBy(sortBy, order === 'asc' ? 'asc' : 'desc');

    // Execute the query to get activities
    const activitiesSnapshot = await activitiesQuery.get();

    const activities = activitiesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Get unique user IDs
    const userIds = activities.map((activity: any) => activity.user_id);
    const uniqueUserIds = [...new Set(userIds)];

    // Get user information from profiles collection
    let users: any[] = [];
    if (uniqueUserIds.length > 0) {
      // Firebase has a limit of 10 items for 'in' queries, so we need to batch them
      const userBatches = [];
      for (let i = 0; i < uniqueUserIds.length; i += 10) {
        const batch = uniqueUserIds.slice(i, i + 10);
        userBatches.push(batch);
      }

      const userPromises = userBatches.map(batch => {
        return db.collection('profiles').where(admin.firestore.FieldPath.documentId(), 'in', batch).get();
      });

      const userSnapshots = await Promise.all(userPromises);
      users = userSnapshots.flatMap(snapshot => 
        snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
      );
    }

    // Create a user name mapping
    const userNameMap: { [key: string]: string } = {};
    users.forEach((user: any) => {
      userNameMap[user.id] = user.student_name || user.name || user.id;
    });

    // Create a new Excel workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Student Activities');

    worksheet.columns = [
      { header: 'Student ID', key: 'studentId', width: 20 },
      { header: 'Student Name', key: 'studentName', width: 20 },
      { header: 'Activity Name', key: 'activityName', width: 30 },
      { header: 'Certificate Type', key: 'certificateType', width: 20 },
      { header: 'Issuer', key: 'issuer', width: 20 },
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Points', key: 'points', width: 10 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'File URL', key: 'fileUrl', width: 30 }
    ];

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD3D3D3' }
    };

    activities.forEach((activity: any) => {
      worksheet.addRow({
        studentId: activity.user_id,
        studentName: userNameMap[activity.user_id] || 'Unknown',
        activityName: activity.activity_name,
        certificateType: activity.certificate_type,
        issuer: activity.issuer,
        date: activity.date,
        points: activity.points,
        description: activity.description,
        fileUrl: activity.file_url
      });
    });

    // Generate Excel buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Create a response with Excel file download
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="activities-${studentId || 'all'}.xlsx"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error: any) {
    console.error('Error generating Excel:', error);
    return NextResponse.json({ error: 'Failed to generate Excel report', details: error.message }, { status: 500 });
  }
}