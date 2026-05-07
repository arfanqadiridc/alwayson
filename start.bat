@echo off
echo ==============================================
echo  1. Compiling AlwaysOn API
echo     [Stored Procedures Enforced]
echo ==============================================

if not exist "target\classes" mkdir target\classes

dir /s /B src\main\java\*.java > sources.txt
javac --release 21 -cp "target\lib-offline\*" -d target\classes @sources.txt

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Compilation Failed! Please check syntax above.
    del sources.txt
    pause
    exit /b 1
)

:: Copy application.yml and UI files to classpath root silently
xcopy /E /Y /I src\main\resources\* target\classes\ >nul
del sources.txt

echo [SUCCESS] Bytecode built locally!
echo.
echo ==============================================
echo  2. Releasing Port 8080 + 8085 (if occupied)...
echo ==============================================
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8085 ^| findstr LISTENING') do (
    echo Killing PID %%a on port 8085...
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8080 ^| findstr LISTENING') do (
    echo Killing PID %%a on port 8080...
    taskkill /F /PID %%a >nul 2>&1
)

echo ==============================================
echo  3. Booting Netty Socket.IO + HTTP Server...
echo ==============================================
java -cp "target\classes;target\lib-offline\*" com.alwayson.api.AlwaysonApiApplication
pause
