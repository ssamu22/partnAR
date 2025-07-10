const userService = require("../models/userService");
const ensureAuthenticated = require("../middlewares/authMiddleware");
const Employee = require("../models/Employee");
const Admin = require("../models/Admin");
const bcrypt = require("bcrypt"); // For password hashing
const validator = require("validator"); // For email validation
const axios = require("axios");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const supabase = require("../utils/supabaseClient");
const Image = require("../models/Image");
const { format } = require("path");

const transporter = nodemailer.createTransport({
  host: "smtp.office365.com",
  port: 587,
  secure: false, // true for port 465, false for other ports
  auth: {
    user: process.env.OUTLOOK_APP_EMAIL,
    pass: process.env.OUTLOOK_APP_PASS,
  },
  tls: {
    ciphers: "SSLv3",
  },
});

exports.login = async (req, res) => {
  const { email, password } = req.body; // Get login details from the request body

  try {
    const employee = await Employee.findByEmail(email); // Fetch employee from DB

    // Check if employee does not exist or password is incorrect
    if (!employee) {
      return res.status(401).json({ message: "Email does not exist" });
    }

    // Check if employee is inactive
    if (!employee.isActive || !employee.isApproved) {
      return res.status(401).json({ message: "Email is not active" });
    }

    // Check if password is correct
    if (!(await employee.validatePassword(password))) {
      return res.status(401).json({ message: "Password is incorrect" });
    }

    // Step 3: Store employee data in session (excluding private info)
    req.session.user = {
      employee_id: employee.employee_id,
      first_name: employee.first_name,
      middle_name: employee.middle_name,
      last_name: employee.last_name,
      email: employee.getEmail(),
      employee_number: employee.employee_number,
    };

    // LOG ACTION

    const { data: newLog, error: logError } = await supabase
      .from("log")
      .insert({
        action: "LOGIN",
        actor: req.session.user.email,
        is_admin: false,
        status: "success",
        employee_number: req.session.user.employee_number,
      })
      .select()
      .single();

    if (logError) {
      console.log("Error in adding new log:", logError);
      return res.status(400).json({ message: "Error adding log" });
    }

    console.log("New log added:", newLog);

    // Step 4: Redirect to the home page or return a success message
    res.redirect("/home"); // You can customize the redirection route as needed
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error during login" });
  }
};

// Handle logout
exports.logout = async (req, res) => {
  // LOG ACTION

  const { data: newLog, error: logError } = await supabase
    .from("log")
    .insert({
      action: "LOGOUT",
      actor: req.session.user.email,
      is_admin: false,
      status: "success",
      employee_number: req.session.user.employee_number,
    })
    .select()
    .single();

  if (logError) {
    console.log("Error in adding new log:", logError);
    return res.status(400).json({ message: "Error adding log" });
  }

  console.log("New log added:", newLog);
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: "Logout Failed" });
    }
    res.clearCookie("connect.sid");
    res.status(200).json({ redirect: "/" });
  });
};

exports.signup = async (req, res) => {
  // Check if a required value are missing.
  const {
    fname,
    mname,
    honorifics,
    lname,
    email,
    password,
    passwordConfirm,
    employee_number,
  } = req.body;

  const signupErrors = [];

  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*\W).+$/;

  if (
    !fname ||
    !lname ||
    !email ||
    !password ||
    !passwordConfirm ||
    !employee_number
  ) {
    return res.status(400).json({
      status: "failed",
      message: "Fill out all required inputs!",
    });
  }

  // Validate email
  if (!validator.isEmail(email)) {
    return res.status(400).json({
      status: "failed",
      message: "Email must be valid!",
    });
  }

  if (!isLPUEmail(email)) {
    signupErrors.push("Please enter a valid LPU email address!");
  }

  // Check if email already exists
  const existingEmployee = await Employee.findByEmail(email);
  if (existingEmployee) {
    signupErrors.push(
      "The email you used already exists! Please try another one."
    );
  }

  // Check if employee number already exists

  const existingEmployeeNumber = await Employee.findByEmployeeNumber(
    employee_number
  );
  const existingEmployeeNumberAdmin = await Admin.findByEmployeeNumber(
    employee_number
  );

  if (existingEmployeeNumber || existingEmployeeNumberAdmin) {
    signupErrors.push("The employee number you used already exists!");
  }

  console.log("CARRY ON ");
  // Validate password
  /*
  PASSWORD Criteria:
  1. Must be alteast 8 characters long
  2. Must contain atleast 1 upper, 1 lower, and 1 special character
  4. Maximum of 64 characters
  3. Passwords must match (password and passwordConfirm)
  */

  if (password.length < 8 || password.length > 64) {
    signupErrors.push("Password must be between 8 to 64 characters long!");
  }

  if (!passwordRegex.test(password)) {
    signupErrors.push(
      "Password must contain atleast 1 uppercase, 1 lowercase, 1 digit, and 1 special character!"
    );
  }

  if (!(password === passwordConfirm)) {
    signupErrors.push(
      "The passwords you provided does not match! Please try again."
    );
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create a user but set the status to inactive
  const employeeData = {
    first_name: fname,
    honorifics: honorifics,
    middle_name: mname,
    last_name: lname,
    employee_number: employee_number,
    email: email,
    password: hashedPassword, // Store the hashed password
    image_id: 68, // Use default profile image_id
    date_created: new Date().toISOString(), // Automatically set the creation date
    isActive: false,
    isApproved: false,
    honorifics: honorifics,
  };

  if (signupErrors.length > 0) {
    return res.status(400).json({
      status: "failed",
      errors: signupErrors,
    });
  }

  // Use the Employee class to create a new employee
  const newEmployee = await Employee.create(employeeData);

  console.log("THE NEW EMPLOYEE:", newEmployee);
  console.log("NEW EMPLOYEE ID:", newEmployee.employee_id);

  const { data, error } = await supabase.from("contact").insert({
    employee_id: newEmployee.employee_id,
    email: email,
  });

  if (error) {
    console.log("ERROR CREATING CONTACT");
  }

  console.log("NEW EMPLOYEE CONTACT:", data);
  // Inactive users must be displayed in the admin page for the admin to accept or reject the user.

  console.log(req.body);
  // Return response

  const { data: newLog, error: logError } = await supabase
    .from("log")
    .insert({
      action: "SIGNED_UP",
      actor: email,
      is_admin: false,
      status: "requested",
      employee_number: employee_number,
    })
    .select()
    .single();

  if (logError) {
    console.log("Error in adding new log:", logError);
    return res.status(400).json({ message: "Error adding log" });
  }

  console.log("New log added:", newLog);

  return res.status(200).json({
    status: "success",
    message: "User successfully register",
    data: req.body,
  });
};

exports.updateProfile = async (req, res) => {
  try {
    const {
      firstName,
      middleName,
      lastName,
      honorifics,
      introduction,
      position,
      researchFields,
      department,
      image_id,
    } = req.body;

    // Sanitize researchFields
    let formattedResearchFields = [];
    if (
      researchFields &&
      (Array.isArray(researchFields) || typeof researchFields === "string")
    ) {
      if (Array.isArray(researchFields)) {
        // Extract values if it's an array of objects
        formattedResearchFields = researchFields.map((field) => field.value);
      } else {
        // Parse and extract values if it's a JSON string
        formattedResearchFields = JSON.parse(researchFields).map(
          (field) => field.value
        );
      }
    }

    // Update the user profile in the database here
    // Assuming you have a function in your model to handle this

    const { data: existingData, error: fetchError } = await supabase
      .from("employee")
      .select("*")
      .eq("employee_id", req.session.user.employee_id)
      .single();

    console.log("EXISTING DATA FIELD:", existingData.field);
    console.log("NEW DATA FIELD:", formattedResearchFields);

    const introIsEdited = existingData.introduction != introduction;
    const fieldIsEdited = 
      (existingData.field || []).join(",") !== formattedResearchFields.join(",");


    const honorIsEdited =
      normalize(honorifics) !== normalize(existingData.honorifics);

    const updatedProfileData = {
      honorifics: honorifics,
      introduction: introduction,
      field: formattedResearchFields,
      oldHonorifics: !existingData.honorIsEdited
        ? existingData.honorifics
        : existingData.oldHonorifics,
      oldField: !existingData.fieldIsEdited
        ? existingData.field
        : existingData.oldField,
      oldIntroduction: !existingData.introIsEdited
        ? existingData.introduction
        : existingData.oldIntroduction,
      introIsEdited: introIsEdited || existingData.introIsEdited,
      fieldIsEdited: fieldIsEdited || existingData.fieldIsEdited,
      honorIsEdited: honorIsEdited || existingData.honorIsEdited,
    };

    if (image_id) {
      updatedProfileData.image_id = image_id;
    }

    const { data: employeeData, error: employeeError } = await supabase
      .from("employee")
      .update(updatedProfileData)
      .eq("employee_id", req.session.user.employee_id)
      .select()
      .single();

    if (employeeError) {
      console.log("FAILED UPDATING EMPLOYEE PROFILE:", employeeError);
      return res.status(400).json({ message: "Failed to update profile" });
    }
    console.log("NEW EMPLOYEE DATA:", employeeData);

    console.log(
      "HONORIFICS CHANGED?",
      existingData.honorifics != updatedProfileData.honorifics
    );

    if (honorIsEdited && !existingData.honorIsEdited) {
      const { data: newLog, error: logError } = await supabase
        .from("log")
        .insert({
          action: "UPDATE_HONORIFICS",
          action_details: `${existingData.honorifics} -> ${updatedProfileData.honorifics}`,
          actor: employeeData.email,
          is_admin: false,
          status: "requested",
          employee_number: employeeData.employee_number,
        })
        .select()
        .single();

      if (logError) {
        console.log("Error in adding new log:", logError);
        return res.status(400).json({ message: "Error adding log" });
      }

      console.log("New log added:", newLog);
    }
    if (introIsEdited && !existingData.introIsEdited) {
      const { data: newLog, error: logError } = await supabase
        .from("log")
        .insert({
          action: "UPDATE_USER_INTRO",
          action_details: `${employeeData.introduction}`,
          actor: employeeData.email,
          is_admin: false,
          status: "requested",
          employee_number: employeeData.employee_number,
        })
        .select()
        .single();

      if (logError) {
        console.log("Error in adding new log:", logError);
        return res.status(400).json({ message: "Error adding log" });
      }

      console.log("New log added:", newLog);
    }
    if (fieldIsEdited && !existingData.fieldIsEdited) {
      const { data: newLog, error: logError } = await supabase
        .from("log")
        .insert({
          action: "UPDATE_RESEARCH_FIELDS",
          action_details: `${employeeData.field}`,
          actor: employeeData.email,
          is_admin: false,
          status: "requested",
          employee_number: employeeData.employee_number,
        })
        .select()
        .single();

      if (logError) {
        console.log("Error in adding new log:", logError);
        return res.status(400).json({ message: "Error adding log" });
      }

      console.log("New log added:", newLog);
    }

    console.log("NEW IMAGE_ID", updatedProfileData.image_id);
    console.log("OLD IMAGE_ID", existingData.image_id);
    if (updatedProfileData.image_id) {
      const { data: newLog, error: logError } = await supabase
        .from("log")
        .insert({
          action: "UPDATE_PROFILE",
          action_details: `Profile image updated`,
          actor: employeeData.email,
          is_admin: false,
          status: "success",
          employee_number: employeeData.employee_number,
        })
        .select()
        .single();

      if (logError) {
        console.log("Error in adding new log:", logError);
        return res.status(400).json({ message: "Error adding log" });
      }

      console.log("New log added:", newLog);
    }

    // Update session with the new profile data, while preserving existing values
    if (req.session.admin) {
      const adminSession = req.session.admin; // Store admin session data temporarily
      req.session.admin = adminSession; // Restore the admin session
      console.log(adminSession);
    }
    req.session.user = {
      ...req.session.user, // Spread existing session values (preserve email, employee_id, etc.)
      first_name: firstName,
      middle_name: middleName,
      last_name: lastName,
      honorifics: honorifics,
      position: position,
      department_id: department,
    };

    // Send a success response
    res
      .status(200)
      .json({ message: "Profile updated successfully!", employeeData });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ message: "Failed to update profile" });
  }
};

exports.approveUser = async (req, res) => {
  // Create activation token
  const activationData = createAccountActivationToken();

  const { data: user, error } = await supabase
    .from("employee")
    .update({
      isApproved: true,
      verification_expiration_date: activationData.tokenExpirationDate,
      account_verification_token: activationData.accountVerificationToken,
    })
    .eq("employee_id", req.params.employeeId)
    .single();

  const { password, password_reset_token, token_expiration_date, ...safeUser } =
    user;

  try {
    const info = transporter
      .sendMail({
        from: `"TEAM MID" <${process.env.OUTLOOK_APP_EMAIL}>`,
        to: safeUser.email,
        subject: "Welcome to ARCMS – Please Activate Your Employee Account",
        text: `Welcome to ARCMS! Your employee account has been approved.
    
    Please verify your account using the link below:
    ${req.protocol}://${req.get("host")}/employee/verified/${
          activationData.verificationToken
        }
    
    After logging in, be sure to change your password.`,

        html: `
        <h2>Welcome to ARCMS!</h2>
        <p>Your employee account has been approved.</p>
        <p>
          Please verify your account:
          <a href="${req.protocol}://${req.get("host")}/employee/verified/${
          activationData.verificationToken
        }">
            Activate My Account
          </a>
        </p>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p><a href="${req.protocol}://${req.get("host")}/employee/verified/${
          activationData.verificationToken
        }">
          ${req.protocol}://${req.get("host")}/employee/verified/${
          activationData.verificationToken
        }
        </a></p>
        <p>We're excited to have you on board!<br>— The ARCMS Team</p>
      `,
      })
      .then((info) => {
        console.log("Email sent successfully:", info.messageId);
      })
      .catch((error) => {
        console.error("Error sending email:", error);
        // Optionally log error to external service
      });

    console.log("Email sent successfully:", info.messageId);
  } catch (error) {
    console.error("Error sending email:", error);
    // Optionally, you can respond with a status or log this to an error tracking service
    res
      .status(500)
      .json({ message: "Failed to send email. Please try again later." });
  }

  const image = await Image.getImageById(safeUser.image_id);
  safeUser.image_url = image ? image.image_url : null;

  // LOG ACTION

  const { data: newLog, error: logError } = await supabase
    .from("log")
    .insert({
      action: "APPROVE_EMPLOYEE",
      actor: req.session.admin.email,
      is_admin: true,
      status: "success",
      employee_number: req.session.admin.employee_number,
    })
    .select()
    .single();

  if (logError) {
    console.log("Error in adding new log:", logError);
    return res.status(400).json({ message: "Error adding log" });
  }

  console.log("New log added:", newLog);

  res.status(200).json({
    status: "success",
    message: "User successfully approved!",
    data: safeUser,
  });
};
exports.approveAll = async (req, res) => {
  // Change the status of the user from inactive to active
  const employees = await Employee.activateEmployees();

  console.log(employees);

  const nodemailer = require("nodemailer");

  for (const employee of employees) {
    try {
      console.log("the employee:", employee);
      const info = await transporter.sendMail({
        from: `"TEAM MID" <${process.env.GOOGLE_APP_EMAIL}>`,
        to: employee.email, // or your test email
        subject: "✔ Registration Approved ✔",
        text: "Registration Approved",
        html: "<p>Your registration has been approved by the administrators. Please <a href='https://arbusinesscardcms.onrender.com/'>login</a> with your account to proceed.</p>",
      });
      console.log(`Email sent to ${employee.email}`);
    } catch (err) {
      console.error(`Failed to send email to ${employee.email}:`, err);
    }

    const image = await Image.getImageById(employee.image_id);
    employee.image_url = image ? image.image_url : null;
  }

  res.status(200).json({
    status: "success",
    message: "User successfully approved!",
    data: employees,
  });
};

exports.changePassword = async (req, res) => {
  // Check if the body contains the current password, new password, and confirm password
  const { newPassword, currentPassword, passwordConfirm } = req.body;
  const employee_id = req.session.user.employee_id;
  const passErrors = [];

  if (!currentPassword || !newPassword || !passwordConfirm) {
    passErrors.push("Please fill out all the required inputs!");
  }

  console.log("CURRENT PASSWORD:", currentPassword);
  console.log("NEW PASSWORD:", newPassword);
  console.log("CONFIRM NEW PASSWORD:", passwordConfirm);
  // Get the current admin
  const employee = await Employee.findById(employee_id);
  const passwordMatch = await employee.validatePassword(
    req.body.currentPassword
  );
  // Check if the current password is correct
  if (!passwordMatch) {
    passErrors.push("Your current password is incorrect!");
  }
  // Validate the password and password confirm
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*\W).+$/;

  // Check if the new password is the same as the last password
  if (currentPassword === newPassword) {
    passErrors.push(
      "Your new password must not be the same as your last password."
    );
  }

  // Check the length of the new password
  if (newPassword.length < 8 || newPassword.length > 64) {
    passErrors.push("Password must be between 8 to 64 characters long!");
  }

  // Check the format of the new password
  if (!passwordRegex.test(newPassword)) {
    passErrors.push(
      "Password must contain atleast 1 uppercase, 1 lowercase, 1 digit, and 1 special character!"
    );
  }

  // Check if password and password confirm are the same
  if (!(newPassword === passwordConfirm)) {
    passErrors.push("Passwords must match!");
  }

  // Hash the new password
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  // Update the admin password into the new one

  // Send response
  if (passErrors.length != 0) {
    return res.status(400).json({
      status: "failed",
      errors: passErrors,
    });
  } else {
    await Employee.changePassword(employee_id, hashedPassword);

    // LOG ACTION

    const { data: newLog, error: logError } = await supabase
      .from("log")
      .insert({
        action: "CHANGE_PASSWORD",
        actor: req.session.user.email,
        is_admin: false,
        status: "success",
        employee_number: req.session.user.employee_number,
      })
      .select()
      .single();

    if (logError) {
      console.log("Error in adding new log:", logError);
      return res.status(400).json({ message: "Error adding log" });
    }

    console.log("New log added:", newLog);

    res.status(200).json({
      status: "success",
      message: "Password successfully updated!",
    });
  }
};

exports.forgotPassword = async (req, res) => {
  // 1. Get the user based on email
  const { data, error } = await supabase
    .from("employee")
    .select("*")
    .eq("email", req.body.email)
    .single();

  if (data === null) {
    console.log("BRUH NO EMAIL");
    return res.status(404).json({
      status: "failed",
      message: "There is no existing user associated with this email address!",
    });
  }

  // 2. Generate the random reset token
  const resetData = createPasswordResetToken();

  await supabase
    .from("employee")
    .update({
      password_reset_token: resetData.passwordResetToken,
      token_expiration_date: resetData.tokenExpirationDate,
    })
    .eq("employee_id", data.employee_id);

  // 3. Send the reset link to the email of the user
  try {
    const reqUrl = `${req.protocol}://${req.get("host")}/reset-password/${
      resetData.resetToken
    }`;

    const info = await transporter.sendMail({
      from: `"TEAM MID" <${process.env.OUTLOOK_APP_EMAIL}>`, // sender address
      to: req.body.email, //  receivers
      subject: "Password Reset Link",
      text: `Password Reset Link`,
      html: `<body>
    <p>We received a request to reset your password.</p>
    <p>If you made this request, please click the link below to reset your password:</p>
    <p><a href="${reqUrl}" style="color: #007bff; text-decoration: none;">${reqUrl}</a></p>
    <p>This link will expire in 10 minutes. If you did not request a password reset, please ignore this email.</p>`,
    });
  } catch (err) {
    console.log(err);
  }

  // LOG ACTION
  const { data: newLog, error: logError } = await supabase
    .from("log")
    .insert({
      action: "FORGOT_PASSWORD",
      actor: req.body.email,
      is_admin: false,
      status: "success",
      employee_number: data.employee_number,
    })
    .select()
    .single();

  res.status(200).json({
    status: "success",
    data,
  });
};

exports.resetPassword = async (req, res) => {
  // Check if a required value are missing.
  const { password, passwordConfirm } = req.body;

  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*\W).+$/;

  // Validate password
  if (!password || !passwordConfirm) {
    return res.status(400).json({
      status: "failed",
      message: "Fill out all required inputs!",
    });
  }

  // if (currentPassword === newPassword) {
  //   passErrors.push(
  //     "Your new password must not be the same as your last password."
  //   );
  // }

  if (password.length < 8 || password.length > 64) {
    return res.status(400).json({
      status: "failed",
      message: "Password must be between 8 to 64 characters long!",
    });
  }

  if (!passwordRegex.test(password)) {
    return res.status(400).json({
      status: "failed",
      message:
        "Password must contain atleast 1 uppercase, 1 lowercase, 1 digit, and 1 special character!",
    });
  }

  if (!(password === passwordConfirm)) {
    return res.status(400).json({
      status: "failed",
      message: "Passwords must match!",
    });
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Update password in database
  const { data, error } = await supabase
    .from("employee")
    .update({ password: hashedPassword })
    .eq("employee_id", req.params.id);

  // Return response
  res.status(200).json({
    status: "success",
    message: "Passsword successfully reset!",
    data,
  });
};

exports.isAuthenticated = (req, res, next) => {
  // If user is authenticated, redirect. else, go to the next middleware
  console.log("USER HAS SESSION? ", req.session);
  if (req.session.user) return res.redirect("/home");
  if (req.session.admin) return res.redirect("/admin/home");

  next();
};

exports.preventCache = (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
};
const createPasswordResetToken = () => {
  const resetToken = crypto.randomBytes(64).toString("hex");

  const passwordResetToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  const tokenExpirationDate = new Date(
    Date.now() + 10 * 60 * 1000
  ).toISOString();

  return {
    resetToken,
    passwordResetToken,
    tokenExpirationDate,
  };
};

const createAccountActivationToken = () => {
  const verificationToken = crypto.randomBytes(64).toString("hex");

  const accountVerificationToken = crypto
    .createHash("sha256")
    .update(verificationToken)
    .digest("hex");

  const tokenExpirationDate = new Date(
    Date.now() + 24 * 60 * 60 * 1000
  ).toISOString(); // Expires in 24 hours

  return {
    verificationToken,
    accountVerificationToken,
    tokenExpirationDate,
  };
};

function normalize(str) {
  return (str || "") // handle null/undefined
    .trim() // remove leading/trailing whitespace
    .replace(/\s+/g, " ") // collapse multiple spaces to one
    .toLowerCase(); // make it case-insensitive (optional)
}

function isLPUEmail(email) {
  return email.endsWith("@lpunetwork.edu.ph") || email.endsWith("@lpu.edu.ph");
}
