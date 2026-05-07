@echo off
echo Booting AlwaysOn API...
:: Point to the newly compiled bytecode folder and the offline library folder
java -cp "target\classes;target\lib-offline\*" com.alwayson.api.AlwaysonApiApplication
pause
