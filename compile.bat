@echo off
echo Compiling AlwaysOn API purely with standard Java Compiler...

if not exist "target\classes" mkdir target\classes

:: Find all java files and dump them to a temporary file
dir /s /B src\main\java\*.java > sources.txt

:: Compile via javac, referencing our offline JAR folder for dependencies
javac --release 21 -parameters -cp "target\lib-offline\*" -d target\classes @sources.txt

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Compilation Failed!
    del sources.txt
    pause
    exit /b 1
)

:: Copy properties and static assets directly into the classpath root
xcopy /E /Y /I src\main\resources\* target\classes\ >nul

echo [SUCCESS] Compilation finished. You are now Maven-independent!
del sources.txt
pause
