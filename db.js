// ==========================================
// DATABASE SERVICE LAYER
// Abstracción para todas las operaciones con Supabase
// ==========================================

const db = {
    // ==========================================
    // MONITORS
    // ==========================================

    async getMonitors() {
        try {
            const { data, error } = await supabase
                .from('monitors')
                .select('*')
                .order('name', { ascending: true });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting monitors:', error);
            throw error;
        }
    },

    async getMonitorById(id) {
        try {
            const { data, error } = await supabase
                .from('monitors')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error getting monitor:', error);
            return null;
        }
    },

    async createMonitor(monitor) {
        try {
            const { data, error } = await supabase
                .from('monitors')
                .insert([{
                    id: monitor.id,
                    name: monitor.name,
                    email: monitor.email,
                    phone: monitor.phone,
                    role: monitor.role || 'monitor',
                    created_date: monitor.createdDate || new Date().toISOString()
                }])
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error creating monitor:', error);
            throw error;
        }
    },

    async updateMonitor(id, updates) {
        try {
            const { data, error } = await supabase
                .from('monitors')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error updating monitor:', error);
            throw error;
        }
    },

    async deleteMonitor(id) {
        try {
            const { error } = await supabase
                .from('monitors')
                .delete()
                .eq('id', id);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error deleting monitor:', error);
            throw error;
        }
    },

    // ==========================================
    // STUDENTS
    // ==========================================

    async getStudents() {
        try {
            const { data, error } = await supabase
                .from('students')
                .select('*')
                .order('name', { ascending: true });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting students:', error);
            throw error;
        }
    },

    async getStudentById(id) {
        try {
            const { data, error } = await supabase
                .from('students')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error getting student:', error);
            return null;
        }
    },

    async createStudent(student) {
        try {
            const { data, error } = await supabase
                .from('students')
                .insert([{
                    id: student.id,
                    name: student.name,
                    email: student.email,
                    phone: student.phone,
                    registered_date: student.registeredDate || new Date().toISOString()
                }])
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error creating student:', error);
            throw error;
        }
    },

    async updateStudent(id, updates) {
        try {
            const { data, error } = await supabase
                .from('students')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error updating student:', error);
            throw error;
        }
    },

    async deleteStudent(id) {
        try {
            const { error } = await supabase
                .from('students')
                .delete()
                .eq('id', id);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error deleting student:', error);
            throw error;
        }
    },

    // ==========================================
    // CLASSES
    // ==========================================

    async getClasses() {
        try {
            const { data, error } = await supabase
                .from('classes')
                .select('*')
                .order('date', { ascending: true });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting classes:', error);
            throw error;
        }
    },

    async getClassById(id) {
        try {
            const { data, error } = await supabase
                .from('classes')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error getting class:', error);
            return null;
        }
    },

    async getClassesByDateRange(startDate, endDate) {
        try {
            const { data, error } = await supabase
                .from('classes')
                .select('*')
                .gte('date', startDate.toISOString())
                .lt('date', endDate.toISOString())
                .order('date', { ascending: true });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting classes by date:', error);
            throw error;
        }
    },

    async getClassesByMonitor(monitorId) {
        try {
            const { data, error } = await supabase
                .from('classes')
                .select('*')
                .eq('monitor_id', monitorId)
                .order('date', { ascending: true });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting classes by monitor:', error);
            throw error;
        }
    },

    async createClass(classData) {
        try {
            const { data, error } = await supabase
                .from('classes')
                .insert([{
                    id: classData.id,
                    day: classData.day,
                    date: classData.date,
                    start_time: classData.startTime,
                    end_time: classData.endTime,
                    students: classData.students,
                    max_capacity: classData.maxCapacity || 4,
                    status: classData.status || 'active',
                    is_completed: classData.isCompleted || false,
                    monitor_id: classData.monitorId,
                    monitor_name: classData.monitorName
                }])
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error creating class:', error);
            throw error;
        }
    },

    async updateClass(id, updates) {
        try {
            // Convert camelCase to snake_case for database
            const dbUpdates = {};
            if (updates.day !== undefined) dbUpdates.day = updates.day;
            if (updates.date !== undefined) dbUpdates.date = updates.date;
            if (updates.startTime !== undefined) dbUpdates.start_time = updates.startTime;
            if (updates.endTime !== undefined) dbUpdates.end_time = updates.endTime;
            if (updates.students !== undefined) dbUpdates.students = updates.students;
            if (updates.maxCapacity !== undefined) dbUpdates.max_capacity = updates.maxCapacity;
            if (updates.status !== undefined) dbUpdates.status = updates.status;
            if (updates.isCompleted !== undefined) dbUpdates.is_completed = updates.isCompleted;
            if (updates.monitorId !== undefined) dbUpdates.monitor_id = updates.monitorId;
            if (updates.monitorName !== undefined) dbUpdates.monitor_name = updates.monitorName;

            const { data, error } = await supabase
                .from('classes')
                .update(dbUpdates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error updating class:', error);
            throw error;
        }
    },

    async deleteClass(id) {
        try {
            const { error } = await supabase
                .from('classes')
                .delete()
                .eq('id', id);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error deleting class:', error);
            throw error;
        }
    },

    // ==========================================
    // UTILITY FUNCTIONS
    // ==========================================

    // Convertir datos de Supabase (snake_case) a formato app (camelCase)
    convertClassFromDB(dbClass) {
        if (!dbClass) return null;
        return {
            id: dbClass.id,
            day: dbClass.day,
            date: dbClass.date,
            startTime: dbClass.start_time,
            endTime: dbClass.end_time,
            students: dbClass.students || [],
            maxCapacity: dbClass.max_capacity,
            status: dbClass.status,
            isCompleted: dbClass.is_completed,
            monitorId: dbClass.monitor_id,
            monitorName: dbClass.monitor_name
        };
    },

    convertStudentFromDB(dbStudent) {
        if (!dbStudent) return null;
        return {
            id: dbStudent.id,
            name: dbStudent.name,
            email: dbStudent.email,
            phone: dbStudent.phone,
            registeredDate: dbStudent.registered_date
        };
    },

    convertMonitorFromDB(dbMonitor) {
        if (!dbMonitor) return null;
        return {
            id: dbMonitor.id,
            name: dbMonitor.name,
            email: dbMonitor.email,
            phone: dbMonitor.phone,
            role: dbMonitor.role,
            createdDate: dbMonitor.created_date
        };
    }
};
