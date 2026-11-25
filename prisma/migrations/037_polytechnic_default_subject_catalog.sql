-- Generated starter curriculum for supported technologies; DEF codes are local defaults, not official BTEB codes.
WITH departments (department, department_key, semester_topics) AS (
    VALUES
        ('Computer Technology', 'CST', ARRAY['Computer Fundamentals', 'Programming Fundamentals', 'Data Structures and Algorithms', 'Object-Oriented Programming and Database Systems', 'Operating Systems and Computer Architecture', 'Web Development and Software Engineering', 'Computer Networks and Cyber Security', 'Capstone Project and Industrial Training']::text[]),
        ('Electrical Technology', 'ELEC', ARRAY['Electrical Engineering Fundamentals', 'Electrical Circuit Analysis', 'Electrical Machines and Transformers', 'Electrical Installation and Wiring', 'Power Generation and Transmission', 'Control Systems and Industrial Automation', 'Power Systems Protection and Renewable Energy', 'Capstone Project and Industrial Training']::text[]),
        ('Civil Technology', 'CIV', ARRAY['Construction Materials', 'Engineering Drawing and CAD', 'Surveying and Levelling', 'Building Construction and Estimating', 'Structural Mechanics and Concrete Technology', 'Hydraulics and Transportation Engineering', 'Soil Mechanics and Foundation Engineering', 'Capstone Project and Industrial Training']::text[]),
        ('Mechanical Technology', 'MECH', ARRAY['Workshop Practice and Safety', 'Engineering Mechanics', 'Manufacturing Processes', 'Thermodynamics and Heat Engines', 'Fluid Mechanics and Hydraulic Machinery', 'Machine Design and Maintenance', 'Production Planning and Quality Control', 'Capstone Project and Industrial Training']::text[]),
        ('Electronics Technology', 'ELEX', ARRAY['Basic Electronics', 'Electronic Devices and Circuits', 'Digital Electronics and Logic Design', 'Microprocessors and Microcontrollers', 'Communication Systems', 'Industrial Electronics and Control', 'Embedded Systems and Instrumentation', 'Capstone Project and Industrial Training']::text[]),
        ('Power Technology', 'POWER', ARRAY['Power Engineering Fundamentals', 'Electrical Machines', 'Thermal Power Plant Systems', 'Boilers and Turbines', 'Power Generation and Distribution', 'Power Plant Operation and Maintenance', 'Energy Efficiency and Renewable Power', 'Capstone Project and Industrial Training']::text[]),
        ('Electro-Medical Technology', 'EMED', ARRAY['Medical Science Fundamentals', 'Electrical and Electronic Measurements', 'Medical Electronics', 'Biomedical Instrumentation', 'Medical Imaging Equipment', 'Biomedical Equipment Maintenance', 'Clinical Engineering and Safety', 'Capstone Project and Industrial Training']::text[]),
        ('Architecture Technology', 'ARCH', ARRAY['Architectural Graphics', 'Architectural Drawing and CAD', 'Building Materials and Construction', 'Architectural Design Studio', 'Structural Systems and Services', 'Landscape and Urban Design', 'Building Planning and Professional Practice', 'Capstone Project and Industrial Training']::text[]),
        ('Automobile Technology', 'AUTO', ARRAY['Automotive Fundamentals', 'Automotive Electrical Systems', 'Internal Combustion Engines', 'Automotive Chassis and Transmission', 'Vehicle Diagnosis and Maintenance', 'Automotive Electronics and Control', 'Vehicle Testing and Workshop Management', 'Capstone Project and Industrial Training']::text[]),
        ('Chemical Technology', 'CHEM', ARRAY['Applied Chemistry', 'Chemical Process Calculations', 'Chemical Engineering Materials', 'Unit Operations', 'Chemical Reaction Engineering', 'Process Instrumentation and Control', 'Industrial Chemical Processes and Safety', 'Capstone Project and Industrial Training']::text[]),
        ('Construction Technology', 'CONST', ARRAY['Construction Materials', 'Construction Drawing and CAD', 'Surveying for Construction', 'Building Construction Methods', 'Construction Estimating and Costing', 'Construction Project Management', 'Quality Control and Site Safety', 'Capstone Project and Industrial Training']::text[]),
        ('Data Telecommunication and Network Technology', 'DTNT', ARRAY['Data Communication Fundamentals', 'Computer Networks', 'Network Devices and Routing', 'Telecommunication Systems', 'Wireless and Broadband Networks', 'Network Security and Administration', 'Advanced Data Networking', 'Capstone Project and Industrial Training']::text[]),
        ('Environmental Technology', 'ENV', ARRAY['Environmental Science', 'Environmental Chemistry', 'Water Quality and Treatment', 'Air and Noise Pollution Control', 'Solid Waste Management', 'Environmental Monitoring and Analysis', 'Environmental Impact and Compliance', 'Capstone Project and Industrial Training']::text[]),
        ('Food Technology', 'FOOD', ARRAY['Food Science Fundamentals', 'Food Chemistry', 'Food Microbiology', 'Food Processing Operations', 'Food Preservation and Packaging', 'Food Quality Assurance', 'Food Plant Operations and Safety', 'Capstone Project and Industrial Training']::text[]),
        ('Graphic Design Technology', 'GDES', ARRAY['Design Fundamentals', 'Digital Illustration', 'Typography and Layout', 'Image Editing and Photography', 'Publication and Packaging Design', 'Motion Graphics and Multimedia', 'Visual Communication and Portfolio', 'Capstone Project and Industrial Training']::text[]),
        ('Marine Technology', 'MAR', ARRAY['Marine Engineering Fundamentals', 'Marine Workshop Practice', 'Marine Diesel Engines', 'Ship Auxiliary Systems', 'Marine Electrical Systems', 'Marine Operations and Maintenance', 'Marine Safety and Environmental Practice', 'Capstone Project and Industrial Training']::text[]),
        ('Mechatronics Technology', 'MCT', ARRAY['Mechatronics Fundamentals', 'Electrical and Electronic Systems', 'Sensors and Actuators', 'Microcontrollers and Embedded Systems', 'Pneumatic and Hydraulic Control', 'Industrial Robotics and Automation', 'Integrated Systems Design and Maintenance', 'Capstone Project and Industrial Training']::text[]),
        ('Refrigeration and Air Conditioning Technology', 'RAC', ARRAY['Refrigeration Fundamentals', 'Refrigeration Components and Controls', 'Air Conditioning Systems', 'Refrigerant Piping and Installation', 'Commercial Refrigeration', 'HVAC Design and Load Estimation', 'System Commissioning and Energy Efficiency', 'Capstone Project and Industrial Training']::text[]),
        ('Surveying Technology', 'SURV', ARRAY['Surveying Fundamentals', 'Chain and Compass Surveying', 'Levelling and Contouring', 'Theodolite and Traverse Surveying', 'Route and Construction Surveying', 'Total Station and GPS Surveying', 'Digital Mapping and Survey Management', 'Capstone Project and Industrial Training']::text[]),
        ('Textile Technology', 'TEXT', ARRAY['Textile Fibres and Yarn', 'Yarn Manufacturing', 'Fabric Manufacturing', 'Textile Dyeing and Printing', 'Textile Finishing', 'Garments Production Technology', 'Textile Testing and Quality Control', 'Capstone Project and Industrial Training']::text[]),
        ('Tourism and Hospitality Technology', 'TOUR', ARRAY['Tourism Fundamentals', 'Communication and Customer Service', 'Front Office Operations', 'Food and Beverage Service', 'Housekeeping Operations', 'Tour Operations and Travel Management', 'Hospitality Supervision and Entrepreneurship', 'Capstone Project and Industrial Training']::text[]),
        ('Instrumentation and Process Control Technology', 'IPC', ARRAY['Instrumentation Fundamentals', 'Electrical and Electronic Measurements', 'Sensors and Transducers', 'Process Instrumentation', 'Control Systems', 'Industrial Automation and PLC', 'Process Safety and Instrument Maintenance', 'Capstone Project and Industrial Training']::text[]),
        ('Printing Technology', 'PRINT', ARRAY['Graphic Communication Fundamentals', 'Prepress and Digital Imaging', 'Printing Materials and Processes', 'Offset Printing Technology', 'Screen and Flexographic Printing', 'Postpress and Finishing', 'Print Production and Quality Control', 'Capstone Project and Industrial Training']::text[]),
        ('Ceramic Technology', 'CER', ARRAY['Ceramic Materials', 'Raw Material Preparation', 'Ceramic Forming Processes', 'Drying and Firing Technology', 'Glazes and Decoration', 'Kiln Operation and Control', 'Ceramic Product Testing and Quality', 'Capstone Project and Industrial Training']::text[]),
        ('Aircraft Maintenance Technology', 'AIR', ARRAY['Aircraft Maintenance Fundamentals', 'Aircraft Materials and Workshop Practice', 'Aircraft Electrical Systems', 'Aircraft Structures', 'Aircraft Powerplant Fundamentals', 'Aircraft Systems Inspection', 'Maintenance Documentation and Safety', 'Capstone Project and Industrial Training']::text[]),
        ('Mining and Mine Survey Technology', 'MINE', ARRAY['Mining Fundamentals', 'Geology and Mineral Resources', 'Mine Surveying', 'Mining Methods', 'Mine Ventilation and Safety', 'Mineral Processing', 'Mine Planning and Environmental Management', 'Capstone Project and Industrial Training']::text[]),
        ('Glass Technology', 'GLASS', ARRAY['Glass Materials and Chemistry', 'Glass Batch Preparation', 'Glass Forming Processes', 'Furnace and Melting Technology', 'Glass Annealing and Finishing', 'Glass Product Manufacturing', 'Glass Testing and Quality Control', 'Capstone Project and Industrial Training']::text[]),
        ('Forestry Technology', 'FOREST', ARRAY['Forestry Fundamentals', 'Forest Botany and Ecology', 'Silviculture', 'Forest Surveying and Mensuration', 'Forest Protection and Conservation', 'Forest Products and Utilization', 'Community Forestry and Management', 'Capstone Project and Industrial Training']::text[]),
        ('Fisheries Technology', 'FISH', ARRAY['Fisheries Fundamentals', 'Aquatic Biology', 'Fish Culture and Hatchery', 'Water Quality Management', 'Fish Health and Nutrition', 'Fish Harvesting and Preservation', 'Aquaculture Management and Marketing', 'Capstone Project and Industrial Training']::text[]),
        ('Agriculture Technology', 'AGRI', ARRAY['Agricultural Fundamentals', 'Soil Science', 'Crop Production', 'Agricultural Engineering', 'Plant Protection', 'Irrigation and Farm Machinery', 'Agricultural Extension and Farm Management', 'Capstone Project and Industrial Training']::text[])
),
semester_courses (semester, common_subjects) AS (
    VALUES
        (1, ARRAY['Mathematics I', 'Physics I', 'English I']::text[]),
        (2, ARRAY['Mathematics II', 'Chemistry', 'Bangla']::text[]),
        (3, ARRAY['Mathematics III', 'Physics II', 'Business Communication']::text[]),
        (4, ARRAY['Mathematics IV', 'Applied Chemistry', 'Engineering Economics']::text[]),
        (5, ARRAY['Industrial Management', 'Environmental Studies', 'Accounting']::text[]),
        (6, ARRAY['Entrepreneurship', 'Quality Control', 'Technical Documentation']::text[]),
        (7, ARRAY['Project Planning', 'Industrial Safety', 'Professional Practice']::text[]),
        (8, ARRAY['Industrial Training', 'Project and Report Writing', 'Employment Skills']::text[])
),
catalog_rows AS (
    SELECT
        institutes.id AS institute_id,
        semester_courses.semester,
        departments.department,
        'DEF-' || departments.department_key || '-S' || semester_courses.semester || '-' ||
            lpad(course.course_number::text, 2, '0') AS code,
        CASE
            WHEN course.course_number <= 3 THEN semester_courses.common_subjects[course.course_number]
            WHEN course.course_number = 4 THEN departments.semester_topics[semester_courses.semester]
            ELSE departments.semester_topics[semester_courses.semester] || ' Practical'
        END AS name,
        CASE WHEN course.course_number = 5 THEN 2 ELSE 3 END::numeric(5,2) AS credits
    FROM public.institutes AS institutes
    CROSS JOIN departments
    CROSS JOIN semester_courses
    CROSS JOIN generate_series(1, 5) AS course(course_number)
)
INSERT INTO public.semester_subjects
    (institute_id, semester, department, code, name, credits, maximum_marks, is_preset)
SELECT institute_id, semester, department, code, name, credits, 100, true
FROM catalog_rows
ON CONFLICT DO NOTHING;
