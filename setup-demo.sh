#!/bin/bash

###############################################################################
# Phase 2 Quick Start Script for Linux/macOS
# 
# This script demonstrates the distributed command executor system.
# Prerequisites: Node.js, curl installed
# 
# Usage:
#   chmod +x setup-demo.sh
#   ./setup-demo.sh [--server http://localhost:3000]
###############################################################################

set -e

SERVER="http://localhost:3000"
DEMO_DIR="/tmp/cmd-executor-demo"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --server)
            SERVER="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

show_menu() {
    clear
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║  CMD Executor - Phase 2 Quick Start (Linux/macOS)              ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "Server: ${YELLOW}${SERVER}${NC}"
    echo -e "Demo directory: ${YELLOW}${DEMO_DIR}${NC}"
    echo ""
    echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}SETUP OPTIONS:${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  ${GREEN}1${NC}. Create demo project (ZIP file)"
    echo -e "  ${GREEN}2${NC}. Start Web Server (npm run dev)"
    echo -e "  ${GREEN}3${NC}. Start Worker Agent (node worker-agent.js)"
    echo -e "  ${GREEN}4${NC}. Run Quick Test (node quickstart.js)"
    echo -e "  ${GREEN}5${NC}. View All Workers (curl API)"
    echo -e "  ${GREEN}6${NC}. View All Jobs (curl API)"
    echo -e "  ${GREEN}7${NC}. Open Web UI in Browser"
    echo -e "  ${GREEN}8${NC}. Tail Worker Logs"
    echo -e "  ${GREEN}9${NC}. Clean up demo files"
    echo -e "  ${GREEN}0${NC}. Exit"
    echo ""
}

create_demo() {
    echo ""
    echo -e "${YELLOW}Creating demo project...${NC}"
    
    mkdir -p "$DEMO_DIR"
    
    # Create package.json
    cat > "$DEMO_DIR/package.json" << 'EOF'
{
  "name": "demo-project",
  "version": "1.0.0",
  "scripts": {
    "test": "echo Demo project test passed"
  }
}
EOF
    
    # Create test script
    cat > "$DEMO_DIR/run-test.sh" << 'EOF'
#!/bin/bash
echo "============== Demo Test Results =============="
echo "Current Directory:"
pwd
echo ""
echo "Files:"
ls -la
echo ""
echo "System Info:"
uname -a
echo ""
echo "Test completed successfully!"
EOF
    
    chmod +x "$DEMO_DIR/run-test.sh"
    
    # Create ZIP file
    echo "Creating ZIP file..."
    cd "$DEMO_DIR"
    zip -r ../demo-project.zip . > /dev/null 2>&1
    cd - > /dev/null
    
    echo -e "${GREEN}✓ Demo project created: /tmp/demo-project.zip${NC}"
    echo ""
    read -p "Press Enter to continue..."
}

start_server() {
    echo ""
    echo -e "${YELLOW}Starting web server...${NC}"
    echo ""
    npm run dev
}

start_worker() {
    echo ""
    echo -e "${YELLOW}Starting worker agent...${NC}"
    echo "Server: $SERVER"
    echo ""
    node worker-agent.js --server "$SERVER"
}

run_quickstart() {
    echo ""
    echo -e "${YELLOW}Running quick start test...${NC}"
    echo ""
    node quickstart.js --server "$SERVER"
    read -p "Press Enter to continue..."
}

list_workers() {
    echo ""
    echo -e "${YELLOW}Fetching registered workers...${NC}"
    echo ""
    curl -s "$SERVER/api/workers/register" | jq . || echo "Failed to fetch workers"
    echo ""
    read -p "Press Enter to continue..."
}

list_jobs() {
    echo ""
    echo -e "${YELLOW}Fetching all jobs...${NC}"
    echo ""
    curl -s "$SERVER/api/jobs/create" | jq . || echo "Failed to fetch jobs"
    echo ""
    read -p "Press Enter to continue..."
}

open_ui() {
    echo ""
    echo -e "${YELLOW}Opening web UI...${NC}"
    echo ""
    
    if command -v xdg-open &> /dev/null; then
        xdg-open "$SERVER"
    elif command -v open &> /dev/null; then
        open "$SERVER"
    else
        echo -e "${RED}Could not open browser. Please visit: $SERVER${NC}"
    fi
    
    read -p "Press Enter to continue..."
}

tail_logs() {
    echo ""
    echo -e "${YELLOW}Displaying recent logs...${NC}"
    echo -e "${YELLOW}(Logs are printed to stdout as workers run)${NC}"
    echo ""
    read -p "Start a worker in another terminal to see logs. Press Enter when ready..."
}

cleanup() {
    echo ""
    echo -e "${YELLOW}Cleaning up demo files...${NC}"
    
    rm -rf "$DEMO_DIR" 2>/dev/null || true
    rm -f /tmp/demo-project.zip 2>/dev/null || true
    
    echo -e "${GREEN}✓ Cleanup complete${NC}"
    echo ""
    read -p "Press Enter to continue..."
}

# Main loop
while true; do
    show_menu
    
    read -p "Enter your choice (0-9): " CHOICE
    
    case $CHOICE in
        1)
            create_demo
            ;;
        2)
            start_server
            ;;
        3)
            start_worker
            ;;
        4)
            run_quickstart
            ;;
        5)
            list_workers
            ;;
        6)
            list_jobs
            ;;
        7)
            open_ui
            ;;
        8)
            tail_logs
            ;;
        9)
            cleanup
            ;;
        0)
            echo ""
            echo -e "${GREEN}Goodbye!${NC}"
            echo ""
            exit 0
            ;;
        *)
            echo -e "${RED}Invalid choice. Please try again.${NC}"
            read -p "Press Enter to continue..."
            ;;
    esac
done
