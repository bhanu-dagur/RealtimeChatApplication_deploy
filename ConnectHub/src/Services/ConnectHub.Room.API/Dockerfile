FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY global.json ./
COPY Shared/ConnectHub.Shared/ConnectHub.Shared.csproj Shared/ConnectHub.Shared/
COPY Services/ConnectHub.Room.API/ConnectHub.Room.API.csproj Services/ConnectHub.Room.API/
RUN dotnet restore Services/ConnectHub.Room.API/ConnectHub.Room.API.csproj

COPY Shared/ConnectHub.Shared/ Shared/ConnectHub.Shared/
COPY Services/ConnectHub.Room.API/ Services/ConnectHub.Room.API/

WORKDIR /src/Services/ConnectHub.Room.API
RUN dotnet publish -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish ./
ENV ASPNETCORE_URLS=http://+:10000
EXPOSE 10000
ENTRYPOINT ["dotnet", "ConnectHub.Room.API.dll"]
